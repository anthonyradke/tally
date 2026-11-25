"""Regressions from the bank sync review: transfers paired once, deleted entries staying deleted, anchoring that
settles, concurrent settles, bank changes reaching entries, connections that fail half way, and smaller guards.
All data is made up; nothing reaches Plaid."""
from __future__ import annotations
import socket
import urllib.request
from datetime import date
import pytest
from app import bank, plaid
from tests.conftest import freeze
from tests.test_bank import FakePlaid
from tests.test_setup import prow


@pytest.fixture
def fake(monkeypatch):
    f = FakePlaid()
    monkeypatch.setenv("PLAID_CLIENT_ID", "id")
    monkeypatch.setenv("PLAID_SECRET", "secret")
    monkeypatch.setenv("PLAID_ENV", "sandbox")
    monkeypatch.setattr(plaid, "call", f)
    return f


def setup_all(client, history="all"):
    accts = client.get("/api/setup").json()["items"][0]["accounts"]
    r = client.post("/api/setup", json={"history": history, "accounts": [{"id": a["id"]} for a in accts]})
    assert r.status_code == 200, r.text
    return r.json()


def entries(client):
    return client.get("/api/transactions?limit=5000").json()["items"]


def cats(client):
    return {c["name"]: c["id"] for c in client.get("/api/bootstrap").json()["categories"]}


# ---------- network errors ----------

def test_network_errors_become_plaid_errors(monkeypatch):
    class Slow:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self, *a):
            raise socket.timeout("timed out")
    monkeypatch.setenv("PLAID_CLIENT_ID", "id")
    monkeypatch.setenv("PLAID_SECRET", "secret")
    monkeypatch.setattr(urllib.request, "urlopen", lambda *a, **k: Slow())
    with pytest.raises(plaid.PlaidError) as e:
        plaid.call("/transactions/sync", {})
    assert e.value.code == "NETWORK"


def test_sync_all_carries_on_past_a_failing_bank(client, fake, monkeypatch):
    freeze(monkeypatch, date(2026, 9, 30))
    client.post("/api/bank/sandbox/connect")
    b = bank.connect()
    b.execute("INSERT INTO items(item_id, access_token) VALUES('item-2','access-2')")
    b.commit()
    real = fake.__call__

    def call(path, body, timeout=30):
        if body.get("access_token") == "access-sandbox-1" and path == "/transactions/sync":
            raise RuntimeError("surprise")
        return real(path, body, timeout)
    monkeypatch.setattr(plaid, "call", call)
    out = bank.sync_all(b)
    assert out[1]["error"] == "SYNC_FAILED" and "error" not in out[2]
    assert b.execute("SELECT error FROM items WHERE id=1").fetchone()[0] == "SYNC_FAILED"


# ---------- one writer at a time ----------

def test_two_settles_at_once_add_a_row_once(client, fake, monkeypatch):
    """A webhook's sync and a tap settling together: the second waits, then finds the row done."""
    import threading
    from app import api_bank, db
    freeze(monkeypatch, date(2026, 9, 30))
    fake.push(added=[prow("x", "acc-chk", 5.0, "2026-09-01", "SQ *THING")])
    client.post("/api/bank/sandbox/connect")
    setup_all(client)
    fake.push(added=[prow("gas", "acc-card", 40.00, "2026-09-20", "SHELL OIL 5544", "Shell", "TRANSPORTATION_GAS",
                          "VERY_HIGH")])
    b = bank.connect()
    bank.sync_all(b)
    b.close()
    gate = threading.Barrier(2)
    real = bank.inbox

    def slow_inbox(bcon, st):
        out = real(bcon, st)
        try:
            gate.wait(timeout=1)  # without the lock both runs have read the inbox before either writes
        except threading.BrokenBarrierError:
            pass
        return out
    monkeypatch.setattr(bank, "inbox", slow_inbox)
    runs = [threading.Thread(target=lambda: api_bank._settle(bank.connect(), db.connect())) for _ in range(2)]
    for t in runs:
        t.start()
    for t in runs:
        t.join()
    assert len([t for t in entries(client) if t["what"] == "Shell"]) == 1


def test_bank_db_uses_wal(client, fake):
    client.post("/api/bank/sandbox/connect")
    assert bank.connect().execute("PRAGMA journal_mode").fetchone()[0] == "wal"


# ---------- transfers: one entry per move ----------

def _linked(txn_id):
    return [r["plaid_id"] for r in bank.connect().execute("SELECT plaid_id FROM txns WHERE txn_id=? AND "
                                                          "status='linked' ORDER BY plaid_id", (txn_id,))]


def test_transfer_sides_four_days_apart_make_one_entry(client, fake, monkeypatch):
    freeze(monkeypatch, date(2026, 9, 30))
    fake.push(added=[prow("out", "acc-chk", 100.00, "2026-09-10", "PAYMENT TO CARD"),
                     prow("in", "acc-card", -100.00, "2026-09-14", "PAYMENT THANK YOU")])
    client.post("/api/bank/sandbox/connect")
    setup_all(client)
    ts = [t for t in entries(client) if t["amount"] == 10000]
    assert len(ts) == 1 and ts[0]["date"] == "2026-09-10"
    assert _linked(ts[0]["id"]) == ["in", "out"]
    assert client.get("/api/bank/inbox").json() == []


def test_two_payments_two_days_apart_make_two_entries(client, fake, monkeypatch):
    freeze(monkeypatch, date(2026, 9, 30))
    fake.push(added=[prow("o1", "acc-chk", 100.00, "2026-09-10", "PAYMENT TO CARD"),
                     prow("i1", "acc-card", -100.00, "2026-09-10", "PAYMENT THANK YOU"),
                     prow("o2", "acc-chk", 100.00, "2026-09-12", "PAYMENT TO CARD"),
                     prow("i2", "acc-card", -100.00, "2026-09-12", "PAYMENT THANK YOU")])
    client.post("/api/bank/sandbox/connect")
    setup_all(client)
    ts = sorted((t for t in entries(client) if t["amount"] == 10000), key=lambda t: t["date"])
    assert [t["date"] for t in ts] == ["2026-09-10", "2026-09-12"]
    assert [_linked(t["id"]) for t in ts] == [["i1", "o1"], ["i2", "o2"]]


def test_learned_card_payment_is_one_entry_each_month(client, fake, monkeypatch):
    """Months 2 and 3: history knows the payment; both sides still make one entry, added by itself."""
    freeze(monkeypatch, date(2026, 9, 30))
    fake.push(added=[prow("o1", "acc-chk", 100.00, "2026-08-10", "PAYMENT TO CARD"),
                     prow("i1", "acc-card", -100.00, "2026-08-10", "PAYMENT THANK YOU")])
    client.post("/api/bank/sandbox/connect")
    setup_all(client)
    fake.push(added=[prow("o2", "acc-chk", 120.00, "2026-09-10", "PAYMENT TO CARD"),
                     prow("i2", "acc-card", -120.00, "2026-09-10", "PAYMENT THANK YOU")])
    assert client.post("/api/bank/sync").json()["added"] == 1
    assert client.get("/api/bank/inbox").json() == []
    freeze(monkeypatch, date(2026, 10, 31))
    fake.push(added=[prow("o3", "acc-chk", 100.00, "2026-10-10", "PAYMENT TO CARD"),
                     prow("i3", "acc-card", -100.00, "2026-10-10", "PAYMENT THANK YOU")])
    client.post("/api/bank/sync")
    oct_ = [t for t in entries(client) if t["date"].startswith("2026-10")]
    assert len(oct_) == 1 and oct_[0]["what"] == "Credit Card Payment"
    assert _linked(oct_[0]["id"]) == ["i3", "o3"]


def test_a_purchase_and_an_unrelated_deposit_are_not_a_transfer(client, fake, monkeypatch):
    freeze(monkeypatch, date(2026, 9, 30))
    fake.push(added=[prow("g", "acc-card", 50.00, "2026-09-12", "KING SOOPERS #12", "King Soopers",
                          "FOOD_AND_DRINK_GROCERIES", "VERY_HIGH"),
                     prow("v", "acc-chk", -50.00, "2026-09-14", "VENMO CASHOUT", "Venmo", "TRANSFER_IN_ACCOUNT_TRANSFER",
                          "HIGH")])
    client.post("/api/bank/sandbox/connect")
    setup_all(client)
    names = {v: k for k, v in cats(client).items()}
    assert [(t["what"], names[t["category_id"]]) for t in entries(client)] == [("King Soopers", "Groceries")]
    box = client.get("/api/bank/inbox").json()
    assert [b["raw"] for b in box] == ["VENMO CASHOUT"] and box[0]["guess"]["source"] != "transfer"


def test_a_card_charge_and_a_deposit_to_checking_are_not_one_move(client, fake, monkeypatch):
    """Opposite sizes the wrong way round: money doesn't move from a card into checking."""
    freeze(monkeypatch, date(2026, 9, 30))
    fake.push(added=[prow("c", "acc-card", 65.00, "2026-09-12", "COSTCO WHSE #1"),
                     prow("d", "acc-chk", -65.00, "2026-09-12", "ONLINE TRANSFER FROM SAV")])
    client.post("/api/bank/sandbox/connect")
    setup_all(client)
    assert entries(client) == []
    assert {b["guess"]["source"] for b in client.get("/api/bank/inbox").json()} == {"none"}


def test_rows_that_only_happen_to_match_wait_for_an_answer(client, fake, monkeypatch):
    """Checking out, card in, same size, but neither says it's a payment: offered as a transfer, not added."""
    freeze(monkeypatch, date(2026, 9, 30))
    fake.push(added=[prow("a", "acc-chk", 30.00, "2026-09-12", "SQ *FARMSTAND"),
                     prow("b", "acc-card", -30.00, "2026-09-13", "REFUND STORE 9")])
    client.post("/api/bank/sandbox/connect")
    setup_all(client)
    assert entries(client) == []
    box = client.get("/api/bank/inbox").json()
    assert {(b["guess"]["source"], b["guess"]["confidence"]) for b in box} == {("transfer", "guess")}


# ---------- pairing only with entries on the row's own account ----------

def _mapped_world(client, world):
    client.post("/api/bank/sandbox/connect")
    ids = {a["name"]: a["id"] for a in client.get("/api/bank").json()["items"][0]["accounts"]}
    client.put(f"/api/bank/accounts/{ids['Checking']}", json={"tally_account_id": world["chk"]})
    client.put(f"/api/bank/accounts/{ids['Card']}", json={"tally_account_id": world["card"]})
    return ids


def test_link_only_pairs_entries_on_the_rows_account_and_side(client, world, fake, monkeypatch):
    """A $65 card charge doesn't pair with a $65 deposit entry on checking; the deposit's own row does."""
    freeze(monkeypatch, date(2026, 9, 30))
    _mapped_world(client, world)
    gift = client.post("/api/transactions", json={"date": "2026-09-12", "what": "From Mom", "category_id": world["pay"],
                                                  "to_id": world["chk"], "amount": 65}).json()
    fake.push(added=[prow("costco", "acc-card", 65.00, "2026-09-12", "COSTCO WHSE #1"),
                     prow("dep", "acc-chk", -65.00, "2026-09-12", "ONLINE TRANSFER FROM SAV")])
    client.post("/api/bank/sync")
    assert _linked(gift["id"]) == ["dep"]
    box = client.get("/api/bank/inbox").json()
    assert [b["raw"] for b in box] == ["COSTCO WHSE #1"]
    r = client.post(f"/api/bank/inbox/{box[0]['id']}/pair", json={"txn_id": gift["id"]})
    assert r.status_code == 422  # not on the card at all


def test_a_transfer_entry_holds_one_row_per_account(client, world, fake, monkeypatch):
    freeze(monkeypatch, date(2026, 9, 30))
    _mapped_world(client, world)
    pay = client.post("/api/transactions", json={"date": "2026-09-10", "what": "Card payment", "category_id": world["move"],
                                                 "from_id": world["chk"], "to_id": world["card"], "amount": 100}).json()
    fake.push(added=[prow("o", "acc-chk", 100.00, "2026-09-10", "PAYMENT TO CARD"),
                     prow("i1", "acc-card", -100.00, "2026-09-11", "PAYMENT THANK YOU"),
                     prow("i2", "acc-card", -100.00, "2026-09-12", "PAYMENT THANK YOU")])
    client.post("/api/bank/sync")
    assert _linked(pay["id"]) == ["i1", "o"]
    left = client.get("/api/bank/inbox").json()
    assert [b["raw"] for b in left] == ["PAYMENT THANK YOU"]
    assert client.post(f"/api/bank/inbox/{left[0]['id']}/pair", json={"txn_id": pay["id"]}).status_code == 409


def test_pair_checks_the_side(client, world, fake, monkeypatch):
    """A card refund isn't the card's charge."""
    freeze(monkeypatch, date(2026, 9, 30))
    _mapped_world(client, world)
    charge = client.post("/api/transactions", json={"date": "2026-09-01", "what": "Shop", "category_id": world["food"],
                                                    "from_id": world["card"], "amount": 20}).json()
    fake.push(added=[prow("r", "acc-card", -20.00, "2026-09-20", "REFUND SHOP")])
    client.post("/api/bank/sync")
    bid = client.get("/api/bank/inbox").json()[0]["id"]
    assert client.post(f"/api/bank/inbox/{bid}/pair", json={"txn_id": charge["id"]}).status_code == 422
    other = client.post("/api/transactions", json={"date": "2026-09-02", "what": "Shop", "category_id": world["food"],
                                                   "from_id": world["card"], "amount": -20}).json()
    assert client.post(f"/api/bank/inbox/{bid}/pair", json={"txn_id": other["id"]}).status_code == 200


# ---------- deleted entries stay deleted ----------

def _restore(client, gone):
    r = client.post("/api/transactions/restore", json={"rows": [{**gone, "amount": gone["amount"] / 100}]})
    assert r.status_code == 201, r.text


def test_deleting_an_auto_transfer_keeps_both_sides_out_and_undo_brings_them_back(client, fake, monkeypatch):
    freeze(monkeypatch, date(2026, 9, 30))
    fake.push(added=[prow("o1", "acc-chk", 100.00, "2026-09-10", "PAYMENT TO CARD"),
                     prow("i1", "acc-card", -100.00, "2026-09-10", "PAYMENT THANK YOU")])
    client.post("/api/bank/sandbox/connect")
    setup_all(client)
    t = next(t for t in entries(client) if t["amount"] == 10000)
    gone = client.delete(f"/api/transactions/{t['id']}").json()
    client.post("/api/bank/sync")
    assert client.get("/api/bank/inbox").json() == []
    assert [x["amount"] for x in entries(client)] == []
    _restore(client, gone)  # the Undo on the delete toast
    client.post("/api/bank/sync")
    assert _linked(t["id"]) == ["i1", "o1"]
    assert [x["id"] for x in entries(client)] == [t["id"]]
    assert [x["txn_id"] for x in client.get("/api/bank/recent").json()] == [t["id"]]


def test_deleting_an_accepted_entry_doesnt_add_it_back(client, fake, monkeypatch):
    """Two coffees accepted teach a sure guess; deleting one puts its row back in the inbox, not in the ledger."""
    freeze(monkeypatch, date(2026, 9, 30))
    fake.push(added=[prow(f"c{i}", "acc-card", 4.0 + i, f"2026-09-1{i}", f"SQ *BLUE BOTTLE {i}", "Blue Bottle")
                     for i in range(3)])
    client.post("/api/bank/sandbox/connect")
    setup_all(client)
    dining = cats(client)["Dining"]
    for _ in range(2):
        box = client.get("/api/bank/inbox").json()
        r = client.post(f"/api/bank/inbox/{box[-1]['id']}/accept", json={"what": "Coffee", "category_id": dining})
        assert r.status_code == 201
    coffee = [t for t in entries(client) if t["what"] == "Coffee"]
    assert len(coffee) == 3  # the third was sure by then and added by itself
    gone = next(t for t in coffee if t["amount"] == 500)  # one accepted by hand
    client.delete(f"/api/transactions/{gone['id']}")
    client.post("/api/bank/sync")
    client.post("/api/bank/sync")
    assert 500 not in [t["amount"] for t in entries(client) if t["what"] == "Coffee"]
    assert [b["raw"] for b in client.get("/api/bank/inbox").json()] == ["SQ *BLUE BOTTLE 1"]


def test_undo_of_added_in_the_check_in_still_works(client, fake, monkeypatch):
    """The check-in's Undo after Add: delete the entry, then reset the row. Both sides of a transfer come back."""
    freeze(monkeypatch, date(2026, 9, 30))
    fake.push(added=[prow("a", "acc-chk", 30.00, "2026-09-12", "SQ *FARMSTAND"),
                     prow("b", "acc-card", -30.00, "2026-09-13", "REFUND STORE 9")])
    client.post("/api/bank/sandbox/connect")
    setup_all(client)
    box = client.get("/api/bank/inbox").json()
    row = next(b for b in box if b["raw"] == "SQ *FARMSTAND")
    e = client.post(f"/api/bank/inbox/{row['id']}/accept", json={}).json()
    assert client.get("/api/bank/inbox").json() == []  # one entry for both sides
    client.delete(f"/api/transactions/{e['id']}")
    assert client.post(f"/api/bank/txns/{row['id']}/reset").status_code == 200
    assert sorted(b["raw"] for b in client.get("/api/bank/inbox").json()) == ["REFUND STORE 9", "SQ *FARMSTAND"]
    assert entries(client) == []


# ---------- anchoring settles ----------

def _account(client, kind):
    return next(a for a in client.get("/api/bootstrap").json()["accounts"] if a["kind"] == kind)


def test_a_typed_month_end_balance_stops_the_anchor(client, fake, monkeypatch):
    freeze(monkeypatch, date(2026, 9, 30))
    fake.accounts.append({"account_id": "acc-ira", "name": "IRA", "mask": "3333", "type": "investment",
                          "subtype": "ira", "balances": {"current": 2000.0}})
    fake.push(added=[prow("pay", "acc-chk", -2000.00, "2026-08-01", "ACME PAYROLL", "Acme", "INCOME_WAGES", "HIGH")])
    client.post("/api/bank/sandbox/connect")
    setup_all(client)
    ira = _account(client, "investment")
    assert ira["start_balance"] == 200000
    assert client.post("/api/month-end/2026-09/typed", json={str(ira["id"]): 2100}).status_code == 200
    starts = []
    for _ in range(3):
        client.post("/api/bank/sync")
        starts.append(_account(client, "investment")["start_balance"])
    assert starts == [200000] * 3
    aug = next(m for m in client.get("/api/bootstrap").json()["months"] if m["month"] == "2026-08-01")
    assert aug["balances"][str(ira["id"])] == 200000


def test_a_loan_with_interest_lands_on_the_banks_balance_in_one_sync(client, fake, monkeypatch):
    from app import db
    freeze(monkeypatch, date(2026, 9, 30))
    fake.accounts.append({"account_id": "acc-loan", "name": "Car Loan", "mask": "4444", "type": "loan",
                          "subtype": "auto", "balances": {"current": 8000.0}})
    fake.push(added=[prow("old", "acc-chk", 5.00, "2026-03-02", "SQ *THING")])
    client.post("/api/bank/sandbox/connect")
    setup_all(client)
    loan = _account(client, "loan")
    con = db.connect()
    con.execute("UPDATE accounts SET loan_rate=0.12 WHERE id=?", (loan["id"],))
    con.commit()
    client.post("/api/bank/sync")
    sep = next(m for m in client.get("/api/bootstrap").json()["months"] if m["month"] == "2026-09-01")
    assert sep["balances"][str(loan["id"])] == 800000
    start = _account(client, "loan")["start_balance"]
    client.post("/api/bank/sync")
    assert _account(client, "loan")["start_balance"] == start


# ---------- the bank's changes reach entries Tally made ----------

SHELL = ("acc-card", "2026-09-20", "SHELL OIL 5544", "Shell", "TRANSPORTATION_GAS", "VERY_HIGH")


def _shell(amount, day="2026-09-20"):
    a, _, raw, m, pfc, conf = SHELL
    return prow("gas", a, amount, day, raw, m, pfc, conf)


def test_a_tip_settling_changes_the_entry_tally_added(client, fake, monkeypatch):
    freeze(monkeypatch, date(2026, 9, 30))
    fake.push(added=[_shell(40.00)])
    client.post("/api/bank/sandbox/connect")
    setup_all(client)
    start = _account(client, "card")["start_balance"]
    fake.accounts[1]["balances"]["current"] = 55.0
    fake.push(modified=[_shell(45.00, "2026-09-21")])
    client.post("/api/bank/sync")
    shell = [(t["amount"], t["date"]) for t in entries(client) if t["what"] == "Shell"]
    assert shell == [(4500, "2026-09-21")]
    assert _account(client, "card")["start_balance"] == start  # the entry explains it; the anchor didn't move


def test_an_entry_you_edited_keeps_your_amount(client, fake, monkeypatch):
    freeze(monkeypatch, date(2026, 9, 30))
    fake.push(added=[_shell(40.00)])
    client.post("/api/bank/sandbox/connect")
    setup_all(client)
    e = next(t for t in entries(client) if t["what"] == "Shell")
    r = client.put(f"/api/transactions/{e['id']}", json={"date": e["date"], "what": "Gas", "category_id": e["category_id"],
                                                         "from_id": e["from_id"], "amount": 38})
    assert r.status_code == 200, r.text
    fake.push(modified=[_shell(45.00)])
    client.post("/api/bank/sync")
    assert [t["amount"] for t in entries(client) if t["what"] == "Gas"] == [3800]
    assert bank.connect().execute("SELECT COUNT(*) FROM txns WHERE was_amount IS NOT NULL").fetchone()[0] == 0
