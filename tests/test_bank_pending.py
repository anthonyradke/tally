"""GET /api/bank/pending: pending bank rows shaped like the entries they'd become, for Activity. Fake Plaid, made-up
data."""
from __future__ import annotations
from datetime import date
import pytest
from app import plaid
from tests.conftest import freeze
from tests.test_bank import FakePlaid, row


@pytest.fixture
def fake(monkeypatch, tmp_path):
    f = FakePlaid()
    monkeypatch.setenv("PLAID_CLIENT_ID", "id")
    monkeypatch.setenv("PLAID_SECRET", "secret")
    monkeypatch.setenv("PLAID_ENV", "sandbox")
    monkeypatch.setattr(plaid, "call", f)
    return f


@pytest.fixture
def linked(client, world, fake, monkeypatch):
    """The fake bank's checking and card, mapped to the world's Checking and Card (as test_bank's fixture)."""
    freeze(monkeypatch, date(2026, 9, 30))
    assert client.post("/api/bank/sandbox/connect").status_code == 201
    ids = {a["name"]: a["id"] for a in client.get("/api/bank").json()["items"][0]["accounts"]}
    for name, key in (("Checking", "chk"), ("Card", "card")):
        assert client.put(f"/api/bank/accounts/{ids[name]}", json={"tally_account_id": world[key]}).status_code == 200
    return ids


def _pending(client):
    r = client.get("/api/bank/pending")
    assert r.status_code == 200, r.text
    return r.json()


def test_off_without_keys(client, monkeypatch):
    monkeypatch.delenv("PLAID_CLIENT_ID", raising=False)
    assert client.get("/api/bank/pending").status_code == 404


def test_charge_deposit_and_refund(client, world, fake, linked):
    fake.push(added=[
        {**row("c", "acc-card", 9.99, "2026-09-25", "SQ *STREAMING CO 0412 DENVER CO", pending=True),
         "authorized_date": "2026-09-24", "logo_url": "https://logos.example/s.png", "website": "streaming.example"},
        row("d", "acc-chk", -1200.0, "2026-09-26", "PAYROLL DEPOSIT ACME", pending=True),
        row("r", "acc-card", -15.0, "2026-09-23", "STORE REFUND", "Corner Store", pending=True),
    ])
    client.post("/api/bank/sync")
    got = {p["raw"][:5]: p for p in _pending(client)}
    c, d, r = got["SQ *S"], got["PAYRO"], got["STORE"]
    assert (c["what"], c["type"], c["amount"], c["account_id"], c["from_id"], c["to_id"], c["date"]) == \
        ("Streaming Co Denver", "Spending", 999, world["card"], world["card"], None, "2026-09-24")
    assert (c["logo"], c["website"], c["category_id"]) == ("https://logos.example/s.png", "streaming.example", None)
    assert (d["type"], d["amount"], d["from_id"], d["to_id"]) == ("Money in", 120000, None, world["chk"])
    # Money back on a card is a refund: negative spending, which the app shows as a green +.
    assert (r["what"], r["type"], r["amount"]) == ("Corner Store", "Spending", -1500)
    assert [p["date"] for p in _pending(client)] == ["2026-09-26", "2026-09-24", "2026-09-23"]  # newest first


def test_posted_zero_and_untracked_rows_left_out(client, world, fake, linked):
    fake.push(added=[row("p", "acc-card", 20.0, "2026-09-20", "POSTED ONE"),
                     row("z", "acc-card", 0.0, "2026-09-25", "CARD CHECK", pending=True),
                     row("k", "acc-chk", 5.0, "2026-09-25", "COFFEE", pending=True)])
    client.post("/api/bank/sync")
    assert [p["raw"] for p in _pending(client)] == ["COFFEE"]
    # Checking marked "not one of mine": its pending rows go too.
    assert client.put(f"/api/bank/accounts/{linked['Checking']}", json={"tally_account_id": None}).status_code == 200
    assert _pending(client) == []


def test_named_and_filed_like_history(client, world, fake, linked):
    fake.push(added=[row("a", "acc-card", 5.25, "2026-09-02", "SQ *BLUE BOTTLE 01", "Blue Bottle Coffee")])
    client.post("/api/bank/sync")
    bid = client.get("/api/bank/inbox").json()[0]["id"]
    client.post(f"/api/bank/inbox/{bid}/accept", json={"what": "Coffee", "category_id": world["food"]})
    fake.push(added=[row("b", "acc-card", 6.0, "2026-09-27", "SQ *BLUE BOTTLE 02", "Blue Bottle Coffee", pending=True)])
    client.post("/api/bank/sync")
    [p] = _pending(client)
    assert (p["what"], p["category_id"], p["type"], p["amount"], p["merchant"]) == \
        ("Coffee", world["food"], "Spending", 600, "Blue Bottle Coffee")


def test_gone_once_posted(client, world, fake, linked):
    fake.push(added=[row("pend", "acc-card", 9.99, "2026-09-25", "STREAMING CO", pending=True)])
    client.post("/api/bank/sync")
    assert len(_pending(client)) == 1
    fake.push(added=[row("post", "acc-card", 9.99, "2026-09-26", "STREAMING CO", pending_id="pend")], removed=["pend"])
    client.post("/api/bank/sync")
    assert _pending(client) == []
    assert [b["raw"] for b in client.get("/api/bank/inbox").json()] == ["STREAMING CO"]


def test_read_only(client, world, fake, linked):
    fake.push(added=[row("pend", "acc-card", 9.99, "2026-09-25", "STREAMING CO", pending=True)])
    client.post("/api/bank/sync")
    before = client.get("/api/bank/inbox").json()
    _pending(client)
    assert client.get("/api/bank/inbox").json() == before
    assert client.get("/api/transactions").json()["total"] == 0

