"""Plaid's webhook (signed messages that new transactions are in), Multi-Item Link, and logos that survive a fresh
database. All data is made up; nothing reaches Plaid."""
from __future__ import annotations
import base64
import hashlib
import json
import time
from datetime import date
import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from app import api_bank, bank, logos, plaid
from tests.conftest import freeze
from tests.test_bank import FakePlaid, row

HOOK = "https://hooks.example/plaid/s3cret"
KEY = ec.generate_private_key(ec.SECP256R1())


def b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def sign(body: bytes, iat: float | None = None, kid: str = "k1", key=KEY) -> str:
    head = b64(json.dumps({"alg": "ES256", "kid": kid, "typ": "JWT"}).encode())
    claims = b64(json.dumps({"iat": int(iat or time.time()), "request_body_sha256": hashlib.sha256(body).hexdigest()}).encode())
    r, s = decode_dss_signature(key.sign(f"{head}.{claims}".encode(), ec.ECDSA(hashes.SHA256())))
    return f"{head}.{claims}.{b64(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}"


class HookPlaid(FakePlaid):
    def __init__(self):
        super().__init__()
        self.hooks: list[tuple[str, str | None]] = []
        self.sessions: dict[str, list[str]] = {}
        self.made: list[dict] = []
        self.exchanged = 0

    def __call__(self, path, body, timeout=30):
        if path == "/webhook_verification_key/get":
            n = KEY.public_key().public_numbers()
            return {"key": {"kty": "EC", "crv": "P-256", "kid": body["key_id"], "x": b64(n.x.to_bytes(32, "big")),
                            "y": b64(n.y.to_bytes(32, "big")), "expired_at": None}}
        if path == "/item/webhook/update":
            self.hooks.append((body["access_token"], body["webhook"]))
            return {"item": {}}
        if path == "/user/create":
            return {"user_id": "usr-1"}
        if path == "/link/token/create":
            self.made.append(body)
            return {"link_token": "link-1"}
        if path == "/link/token/get":
            return {"link_sessions": [{"results": {"item_add_results": [
                {"public_token": t} for t in self.sessions.get(body["link_token"], [])]}}]}
        if path == "/item/public_token/exchange":
            self.exchanged += 1
            n = body["public_token"].rsplit("-", 1)[-1]
            return {"access_token": f"access-{n}", "item_id": f"item-{n}"}
        return super().__call__(path, body, timeout)


@pytest.fixture
def fake(monkeypatch, tmp_path):
    f = HookPlaid()
    monkeypatch.setenv("PLAID_CLIENT_ID", "id")
    monkeypatch.setenv("PLAID_SECRET", "secret")
    monkeypatch.setenv("PLAID_ENV", "sandbox")
    monkeypatch.setenv("PLAID_WEBHOOK_URL", HOOK)
    monkeypatch.setattr(plaid, "call", f)
    monkeypatch.setattr(plaid, "_keys", {})
    monkeypatch.setattr(api_bank, "_used", set())
    return f


def test_signature_checks(fake):
    body = b'{\n  "webhook_type": "TRANSACTIONS"\n}'
    assert plaid.verify_webhook(body, sign(body)) is True
    assert plaid.verify_webhook(body + b" ", sign(body)) is False  # a body changed after signing
    assert plaid.verify_webhook(body, sign(body, iat=time.time() - 600)) is False  # too old
    assert plaid.verify_webhook(body, sign(body, key=ec.generate_private_key(ec.SECP256R1()))) is False
    assert plaid.verify_webhook(body, None) is False
    assert plaid.verify_webhook(body, "a.b.c") is False
    head = b64(json.dumps({"alg": "none", "kid": "k1"}).encode())
    assert plaid.verify_webhook(body, head + "." + sign(body).split(".", 1)[1]) is False


def test_webhook_syncs_the_bank_that_changed(client, fake, monkeypatch):
    freeze(monkeypatch, date(2026, 9, 30))
    monkeypatch.setenv("TALLY_TOKEN", "tok")
    h = {"Authorization": "Bearer tok"}
    assert client.post("/api/bank/sandbox/connect", headers=h).status_code == 201
    fake.push(added=[row("new1", "acc-card", 9.5, "2026-09-29", "COFFEE", "Blue Cup")])
    msg = json.dumps({"webhook_type": "TRANSACTIONS", "webhook_code": "SYNC_UPDATES_AVAILABLE",
                      "item_id": "item-1"}).encode()
    # No login on this path, but the secret in it and Plaid's signature are both required.
    assert client.post("/api/bank/webhook/wrong", content=msg, headers={"Plaid-Verification": sign(msg)}).status_code == 404
    assert client.post("/api/bank/webhook/s3cret", content=msg).status_code == 401
    assert client.post("/api/bank/webhook/s3cret", content=msg + b" ",
                       headers={"Plaid-Verification": sign(msg)}).status_code == 401
    assert client.get("/api/bank/webhook/s3cret").status_code == 401  # only POST skips the login
    r = client.post("/api/bank/webhook/s3cret", content=msg, headers={"Plaid-Verification": sign(msg)})
    assert r.status_code == 200, r.text
    b = bank.connect()
    assert b.execute("SELECT merchant FROM txns WHERE plaid_id='new1'").fetchone()[0] == "Blue Cup"
    b.close()
    err = json.dumps({"webhook_type": "ITEM", "webhook_code": "PENDING_EXPIRATION", "item_id": "item-1"}).encode()
    client.post("/api/bank/webhook/s3cret", content=err, headers={"Plaid-Verification": sign(err)})
    assert client.get("/api/bank", headers=h).json()["items"][0]["error"] == "PENDING_EXPIRATION"


def test_connections_are_pointed_at_the_webhook(client, fake):
    b = bank.connect()
    b.execute("INSERT INTO items(item_id, access_token, institution) VALUES('old', 'access-old', 'Old Bank')")
    b.commit()
    assert bank.point_webhooks(b) == 1
    assert bank.point_webhooks(b) == 0  # already there
    b.close()
    assert fake.hooks == [("access-old", HOOK)]


def test_one_session_adds_several_banks(client, fake):
    r = client.post("/api/bank/link-token", json={})
    assert r.json() == {"link_token": "link-1", "multi": True}
    assert fake.made[-1]["user_id"] == "usr-1" and fake.made[-1]["enable_multi_item_link"] is True
    assert fake.made[-1]["webhook"] == HOOK
    fake.sessions["link-1"] = ["public-a", "public-b"]
    r = client.post("/api/bank/connect", json={"link_token": "link-1"})
    assert r.status_code == 201, r.text
    assert len(r.json()["items"]) == 2
    # Plaid's own SESSION_FINISHED message arrives too: the same tokens aren't exchanged twice.
    msg = json.dumps({"webhook_type": "LINK", "webhook_code": "SESSION_FINISHED",
                      "public_tokens": ["public-a", "public-b"]}).encode()
    client.post("/api/bank/webhook/s3cret", content=msg, headers={"Plaid-Verification": sign(msg)})
    assert fake.exchanged == 2
    # A repair keeps to one bank and needs no Plaid user.
    iid = client.get("/api/bank").json()["items"][0]["id"]
    client.post("/api/bank/link-token", json={"item_id": iid})
    assert "user_id" not in fake.made[-1] and fake.made[-1]["access_token"] == "access-a"


def test_logos_never_carry_over_to_a_new_database(client, fake, monkeypatch, tmp_path):
    """Bank 1 in a fresh database is a different bank from the old bank 1: its logo is looked up again."""
    monkeypatch.setenv("LOGO_DEV_KEY", "pk_test")
    asked = []
    monkeypatch.setattr(logos, "_get", lambda url: asked.append(url) or b"\x89PNG\r\n\x1a\nold")
    fake.sessions["link-1"] = ["public-a"]
    client.post("/api/bank/connect", json={"link_token": "link-1"})
    iid = client.get("/api/bank").json()["items"][0]["id"]
    assert client.get("/api/logo", params={"item": iid}).status_code == 200
    n = len(asked)
    monkeypatch.setenv("TALLY_BANK_DB", str(tmp_path / "again.db"))
    monkeypatch.setattr(api_bank, "_used", set())
    fake.sessions["link-2"] = ["public-z"]
    client.post("/api/bank/connect", json={"link_token": "link-2"})
    assert client.get("/api/bank").json()["items"][0]["id"] == iid  # the same number...
    client.get("/api/logo", params={"item": iid})
    assert len(asked) > n  # ...but not the same bank, so not the same logo


class TwoBanks(HookPlaid):
    """The test bank, then a student loan servicer on its own connection."""
    def __call__(self, path, body, timeout=30):
        if path == "/accounts/get" and body["access_token"] != "access-1":
            return {"accounts": [{"account_id": "acc-loan", "name": "Direct Loan", "mask": "0042", "type": "loan",
                                  "subtype": "student", "balances": {"current": 12000.0, "available": None}}]}
        if path == "/institutions/get_by_id" and self.exchanged > 1:
            return {"institution": {"name": "MOHELA"}}
        return super().__call__(path, body, timeout)


def test_a_bank_added_after_setup_brings_its_accounts(client, fake, monkeypatch):
    f = TwoBanks()
    monkeypatch.setattr(plaid, "call", f)
    monkeypatch.setattr(api_bank, "_used", set())
    freeze(monkeypatch, date(2026, 9, 30))
    assert client.post("/api/bank/sandbox/connect").status_code == 201
    accts = client.get("/api/setup").json()["items"][0]["accounts"]
    assert client.post("/api/setup", json={"history": "all", "accounts": [{"id": a["id"]} for a in accts]}).status_code == 200
    f.sessions["link-1"] = ["public-mohela"]
    r = client.post("/api/bank/connect", json={"link_token": "link-1"})
    assert r.status_code == 201, r.text
    assert [(m["name"], m["kind"]) for m in r.json()["made"]] == [("MOHELA Direct Loan", "loan")]
    b = client.get("/api/bootstrap").json()
    loan = next(a for a in b["accounts"] if a["name"] == "MOHELA Direct Loan")
    assert b["months"][-1]["balances"][str(loan["id"])] == 1200000  # held at the servicer's balance
    assert client.get("/api/bank").json()["ask"] == []
