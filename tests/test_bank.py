"""Bank sync against a fake Plaid: pairing bank rows with entries, guesses from history, transfers, pending rows,
the inbox and the audit. All data is made up."""
from __future__ import annotations
import pytest
from app import bank, plaid
from tests.conftest import freeze, txn
from datetime import date


class FakePlaid:
    def __init__(self):
        self.accounts = [
            {"account_id": "acc-chk", "name": "Checking", "mask": "1111", "type": "depository", "subtype": "checking",
             "balances": {"current": 900.0, "available": 900.0}},
            {"account_id": "acc-card", "name": "Card", "mask": "2222", "type": "credit", "subtype": "credit card",
             "balances": {"current": 50.0, "available": 4950.0}},
        ]
        self.pages: list[dict] = []
        self.removed: list[str] = []

    def push(self, added=(), modified=(), removed=()):
        self.pages.append({"added": list(added), "modified": list(modified),
                           "removed": [{"transaction_id": r} for r in removed]})

    def __call__(self, path, body, timeout=30):
        if path == "/sandbox/public_token/create":
            return {"public_token": "public-sandbox-1"}
        if path == "/item/public_token/exchange":
            return {"access_token": "access-sandbox-1", "item_id": "item-1"}
        if path == "/item/get":
            return {"item": {"institution_id": "ins_1"}}
        if path == "/institutions/get_by_id":
            return {"institution": {"name": "Test Bank"}}
        if path == "/accounts/get":
            return {"accounts": self.accounts}
        if path == "/transactions/sync":
            page = self.pages.pop(0) if self.pages else {"added": [], "modified": [], "removed": []}
            n = int(body.get("cursor") or 0) + 1
            return {**page, "next_cursor": str(n), "has_more": False}
        if path == "/item/remove":
            self.removed.append(body["access_token"])
            return {}
        raise AssertionError(path)


def row(tid, account, amount, day, raw="", merchant=None, pending=False, pending_id=None, pfc=None, entity=None):
    return {"transaction_id": tid, "account_id": account, "amount": amount, "date": day, "authorized_date": day,
            "original_description": raw, "name": raw, "merchant_name": merchant, "merchant_entity_id": entity,
            "pending": pending, "pending_transaction_id": pending_id,
            "personal_finance_category": {"primary": (pfc or "").split("_")[0] or None, "detailed": pfc}}


@pytest.fixture
def fake(monkeypatch, tmp_path):
    f = FakePlaid()
    monkeypatch.setenv("PLAID_CLIENT_ID", "id")
    monkeypatch.setenv("PLAID_SECRET", "secret")
    monkeypatch.setenv("PLAID_ENV", "sandbox")
    monkeypatch.setenv("TALLY_BANK_DB", str(tmp_path / "bank.db"))
    monkeypatch.setattr(plaid, "call", f)
    return f


@pytest.fixture
def linked(client, world, fake, monkeypatch):
    """A connected test bank whose checking and card are mapped to the world's Checking and Card."""
    freeze(monkeypatch, date(2026, 9, 30))
    r = client.post("/api/bank/sandbox/connect")
    assert r.status_code == 201, r.text
    accts = client.get("/api/bank").json()["items"][0]["accounts"]
    ids = {a["name"]: a["id"] for a in accts}
    assert client.put(f"/api/bank/accounts/{ids['Checking']}", json={"tally_account_id": world["chk"]}).status_code == 200
    assert client.put(f"/api/bank/accounts/{ids['Card']}", json={"tally_account_id": world["card"]}).status_code == 200
    return ids


def test_off_without_keys(client, monkeypatch):
    monkeypatch.delenv("PLAID_CLIENT_ID", raising=False)
    assert client.get("/api/bank").status_code == 404
    assert client.get("/api/bank/inbox").status_code == 404


def test_clean():
    assert bank.clean("SQ *BLUE BOTTLE COFFEE 0412 DENVER CO") == "BLUE BOTTLE COFFEE DENVER"
    assert bank.clean("TST* LUNA 12345") == "LUNA"
    assert bank.clean("PURCHASE AUTHORIZED ON 09/12 KING SOOPERS #123 BOULDER CO") == "KING SOOPERS BOULDER"
    assert bank.clean("") == ""


def test_pairs_with_existing_entry(client, world, fake, linked):
    client.post("/api/transactions", json=txn(world, what="Market", amount=12.34, date="2026-09-10"))
    fake.push(added=[row("t1", "acc-card", 12.34, "2026-09-11", "KING SOOPERS #12 BOULDER CO", "King Soopers")])
    assert client.post("/api/bank/sync").json()["paired"] == 1
    assert client.get("/api/bank/inbox").json() == []


def test_direction_must_agree(client, world, fake, linked):
    """A $12.34 refund on the card isn't the $12.34 charge."""
    client.post("/api/transactions", json=txn(world, amount=12.34))
    fake.push(added=[row("t1", "acc-card", -12.34, "2026-09-10", "REFUND")])
    assert client.post("/api/bank/sync").json()["paired"] == 0


def test_history_makes_it_sure(client, world, fake, linked):
    fake.push(added=[row("a", "acc-card", 5.25, "2026-09-02", "SQ *BLUE BOTTLE 01 DENVER CO", "Blue Bottle Coffee"),
                     row("b", "acc-card", 6.00, "2026-09-05", "SQ *BLUE BOTTLE 02 DENVER CO", "Blue Bottle Coffee"),
                     row("c", "acc-card", 4.75, "2026-09-09", "SQ *BLUE BOTTLE 03 DENVER CO", "Blue Bottle Coffee")])
    client.post("/api/bank/sync")
    box = client.get("/api/bank/inbox").json()
    assert [b["guess"]["confidence"] for b in box] == ["unknown"] * 3
    oldest = box[-1]
    r = client.post(f"/api/bank/inbox/{oldest['id']}/accept", json={"what": "Coffee", "category_id": world["food"]})
    assert r.status_code == 201, r.text
    e = r.json()
    assert (e["what"], e["from_id"], e["to_id"], e["amount"], e["date"]) == ("Coffee", world["card"], None, 525, "2026-09-02")
    box = client.get("/api/bank/inbox").json()
    assert {b["guess"]["confidence"] for b in box} == {"likely"}
    client.post(f"/api/bank/inbox/{box[-1]['id']}/accept", json={})
    box = client.get("/api/bank/inbox").json()
    assert len(box) == 1 and box[0]["guess"]["confidence"] == "sure"
    assert box[0]["guess"]["what"] == "Coffee" and box[0]["guess"]["category_id"] == world["food"]
    added = client.post("/api/bank/inbox/accept-sure").json()
    assert [a["amount"] for a in added] == [475]
    assert client.get("/api/bank/inbox").json() == []


def test_transfer_pairs_both_sides(client, world, fake, linked, monkeypatch):
    pay = client.post("/api/categories", json={"name": "Credit Card Payment", "type": "Transfer"}).json()["id"]
    fake.push(added=[row("p1", "acc-chk", 50.0, "2026-09-20", "CARD AUTOPAY"),
                     row("p2", "acc-card", -50.0, "2026-09-21", "PAYMENT THANK YOU")])
    client.post("/api/bank/sync")
    box = client.get("/api/bank/inbox").json()
    assert len(box) == 2
    g = next(b for b in box if b["account_id"] == world["chk"])["guess"]
    assert (g["source"], g["category_id"], g["from_id"], g["to_id"], g["amount"]) == \
        ("transfer", pay, world["chk"], world["card"], 5000)
    chk = next(b for b in box if b["account_id"] == world["chk"])
    assert client.post(f"/api/bank/inbox/{chk['id']}/accept", json={}).status_code == 201
    assert client.get("/api/bank/inbox").json() == []  # the card's side paired with the same entry


def test_money_in_and_refund_shapes(client, world, fake, linked):
    fake.push(added=[row("i", "acc-chk", -1500.0, "2026-09-15", "ACME PAYROLL", pfc="INCOME_WAGES"),
                     row("r", "acc-card", -20.0, "2026-09-16", "REFUND STORE")])
    client.post("/api/bank/sync")
    box = {b["raw"]: b for b in client.get("/api/bank/inbox").json()}
    g = box["ACME PAYROLL"]["guess"]
    assert (g["category_id"], g["from_id"], g["to_id"], g["amount"]) == (world["pay"], None, world["chk"], 150000)
    r = client.post(f"/api/bank/inbox/{box['REFUND STORE']['id']}/accept", json={"category_id": world["food"]}).json()
    assert (r["from_id"], r["to_id"], r["amount"]) == (world["card"], None, -2000)


def test_pending_then_posted_keeps_decision(client, world, fake, linked):
    fake.push(added=[row("pend", "acc-card", 9.99, "2026-09-25", "STREAMING CO", pending=True)])
    client.post("/api/bank/sync")
    box = client.get("/api/bank/inbox").json()
    assert box[0]["pending"] and box[0]["guess"] is None
    assert client.post(f"/api/bank/inbox/{box[0]['id']}/accept", json={}).status_code == 422
    client.post(f"/api/bank/inbox/{box[0]['id']}/ignore")
    fake.push(added=[row("post", "acc-card", 9.99, "2026-09-26", "STREAMING CO", pending_id="pend")],
              removed=["pend"])
    client.post("/api/bank/sync")
    assert client.get("/api/bank/inbox").json() == []


def test_deleted_entry_comes_back_to_inbox(client, world, fake, linked):
    fake.push(added=[row("x", "acc-card", 30.0, "2026-09-12", "GAS STATION")])
    client.post("/api/bank/sync")
    bid = client.get("/api/bank/inbox").json()[0]["id"]
    e = client.post(f"/api/bank/inbox/{bid}/accept", json={"category_id": world["gas"]}).json()
    assert client.get("/api/bank/inbox").json() == []
    client.delete(f"/api/transactions/{e['id']}")
    assert [b["id"] for b in client.get("/api/bank/inbox").json()] == [bid]


def test_unmapped_accounts_stay_out(client, world, fake, linked):
    client.put(f"/api/bank/accounts/{linked['Card']}", json={"tally_account_id": None})
    fake.push(added=[row("u", "acc-card", 3.0, "2026-09-12", "SNACK")])
    client.post("/api/bank/sync")
    assert client.get("/api/bank/inbox").json() == []
    assert client.get("/api/bank").json()["waiting"] == 0


def test_one_bank_account_per_ledger_account(client, world, fake, linked):
    r = client.put(f"/api/bank/accounts/{linked['Card']}", json={"tally_account_id": world["chk"]})
    assert r.status_code == 422


def test_audit(client, world, fake, linked):
    client.post("/api/transactions", json=txn(world, amount=12.34, date="2026-09-10"))
    client.post("/api/transactions", json=txn(world, what="Forgot", amount=7.00, date="2026-09-14"))
    fake.push(added=[row("m", "acc-card", 12.34, "2026-09-10", "MARKET"),
                     row("n", "acc-card", 40.00, "2026-09-13", "HARDWARE STORE")])
    client.post("/api/bank/sync")
    a = client.get(f"/api/bank/audit/{linked['Card']}").json()
    assert a["matched"] == 1
    assert [m["raw"] for m in a["missing"]] == ["HARDWARE STORE"]
    assert [x["what"] for x in a["extra"]] == ["Forgot"]
    assert a["bank_balance"] == 5000 and a["tally_balance"] == 1934 and a["gap"] == 3066


def test_removed_rows_go_unless_decided(client, world, fake, linked):
    fake.push(added=[row("z", "acc-card", 1.0, "2026-09-12", "TEST CHARGE")])
    client.post("/api/bank/sync")
    fake.push(removed=["z"])
    assert client.post("/api/bank/sync").json()["synced"]
    assert client.get("/api/bank/inbox").json() == []


def test_disconnect(client, fake, linked):
    iid = client.get("/api/bank").json()["items"][0]["id"]
    assert client.delete(f"/api/bank/items/{iid}").status_code == 204
    assert fake.removed == ["access-sandbox-1"]
    assert client.get("/api/bank").json()["items"] == []


def test_connect_matches_clear_accounts(client, world, fake, monkeypatch):
    """Checking finds Checking by name; the card is a tie between two cards, so it waits to be asked."""
    freeze(monkeypatch, date(2026, 9, 30))
    client.post("/api/accounts", json={"name": "Other card", "kind": "card"})
    old = client.post("/api/accounts", json={"name": "Old Checking", "kind": "cash"}).json()["id"]
    client.put(f"/api/accounts/{old}", json={"name": "Old Checking", "kind": "cash", "active": False})
    r = client.post("/api/bank/sandbox/connect").json()
    assert [m["account_id"] for m in r["matched"]] == [world["chk"]]
    s = client.get("/api/bank").json()
    assert [a["name"] for a in s["ask"]] == ["Card"] and s["ask"][0]["kinds"] == ["card"]
    card = s["ask"][0]["id"]
    assert client.put(f"/api/bank/accounts/{card}", json={"tally_account_id": None}).status_code == 200
    assert client.get("/api/bank").json()["ask"] == []  # answered "not used": not asked again


def test_inbox_starts_near_last_entry(client, world, fake, monkeypatch):
    """Rows from well before the account's last entry go to the audit, not the inbox."""
    freeze(monkeypatch, date(2026, 9, 30))
    client.post("/api/transactions", json=txn(world, date="2026-09-20"))
    client.post("/api/bank/sandbox/connect")
    acct = next(a for a in client.get("/api/bank").json()["items"][0]["accounts"] if a["name"] == "Card")
    client.put(f"/api/bank/accounts/{acct['id']}", json={"tally_account_id": world["card"]})
    fake.push(added=[row("old", "acc-card", 7.00, "2026-09-01", "OLD PLACE"),
                     row("edge", "acc-card", 8.00, "2026-09-17", "EDGE PLACE"),
                     row("new", "acc-card", 9.00, "2026-09-25", "NEW PLACE")])
    client.post("/api/bank/sync")
    assert [b["raw"] for b in client.get("/api/bank/inbox").json()] == ["NEW PLACE", "EDGE PLACE"]
    assert client.get("/api/bank").json()["waiting"] == 2
    assert "OLD PLACE" in [m["raw"] for m in client.get(f"/api/bank/audit/{acct['id']}").json()["missing"]]


def test_accept_many_and_throttled_sync(client, world, fake, linked):
    fake.push(added=[row("a", "acc-card", 5.00, "2026-09-20", "SHELL OIL 123", "Shell", pfc="TRANSPORTATION_GAS"),
                     row("b", "acc-card", 6.00, "2026-09-21", "MYSTERY 9")])
    client.post("/api/bank/sync")
    box = {b["raw"]: b for b in client.get("/api/bank/inbox").json()}
    assert box["SHELL OIL 123"]["guess"]["category_id"] == world["gas"]
    added = client.post("/api/bank/inbox/accept", json={"ids": [b["id"] for b in box.values()]}).json()
    assert [t["what"] for t in added] == ["Shell"]  # the one without a category stays
    assert [b["raw"] for b in client.get("/api/bank/inbox").json()] == ["MYSTERY 9"]
    fake.push(added=[row("c", "acc-card", 7.00, "2026-09-22", "LATER")])
    client.post("/api/bank/sync?max_age=3600")  # checked a moment ago: Plaid isn't asked
    assert len(fake.pages) == 1
    client.post("/api/bank/sync?max_age=0")
    assert fake.pages == []
