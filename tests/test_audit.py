"""Regression tests for the 2026-09-22 audit: each test pins one bug that used to ship."""
import time
from datetime import date, timedelta
import pytest
from fastapi.testclient import TestClient
from app.recurring import step


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TALLY_DB", str(tmp_path / "t.db"))
    from app.main import app
    return TestClient(app)


def _setup(c):
    ids = lambda r: r.json()["id"]
    chk = ids(c.post("/api/accounts", json={"name": "Checking", "kind": "cash", "start_balance": 1000}))
    card = ids(c.post("/api/accounts", json={"name": "Card", "kind": "card", "start_balance": 200}))
    groc = ids(c.post("/api/categories", json={"name": "Groceries", "type": "Spending"}))
    pay = ids(c.post("/api/categories", json={"name": "Paycheck", "type": "Money in"}))
    t = c.post("/api/transactions", json={"date": date.today().isoformat(), "what": "Costco", "category_id": groc,
                                          "from_id": card, "amount": 50, "note": "n", "tags": ["x"]}).json()
    return chk, card, groc, pay, t


def test_refused_delete_does_not_lock_the_database(client):
    chk, card, groc, pay, t = _setup(client)
    assert client.delete(f"/api/categories/{groc}").status_code == 409
    assert client.delete(f"/api/accounts/{card}").status_code == 409
    t0 = time.monotonic()
    assert client.get("/api/bootstrap").status_code == 200
    assert client.post("/api/transactions", json={"date": "2026-09-01", "what": "x", "category_id": groc,
                                                  "from_id": card, "amount": 1}).status_code == 201
    assert time.monotonic() - t0 < 2  # a leaked write lock made every request wait 5 s, then fail


def test_hidden_category_and_account_keep_working(client):
    chk, card, groc, pay, t = _setup(client)
    before = client.get("/api/bootstrap").json()["months"][-1]["net_worth"]
    client.put(f"/api/categories/{groc}", json={"name": "Groceries", "type": "Spending", "active": False})
    client.put(f"/api/accounts/{card}", json={"name": "Card", "kind": "card", "start_balance": 200, "active": False})
    boot = client.get("/api/bootstrap")
    assert boot.status_code == 200
    b = boot.json()
    assert b["months"][-1]["net_worth"] == before  # the card's balance still counts
    assert [c["active"] for c in b["categories"] if c["id"] == groc] == [False]
    assert [a["active"] for a in b["accounts"] if a["id"] == card] == [False]
    for path in ("/api/transactions", "/export/log.csv", "/export/months.csv", f"/api/month-end/{date.today():%Y-%m}"):
        assert client.get(path).status_code == 200, path
    r = client.put(f"/api/transactions/{t['id']}", json={**t, "amount": 51})
    assert r.status_code == 200 and r.json()["amount"] == 5100


def test_bulk_recategorize_respects_from_to_rules(client):
    chk, card, groc, pay, t = _setup(client)
    gas = client.post("/api/categories", json={"name": "Gas", "type": "Spending"}).json()["id"]
    r = client.post("/api/transactions/bulk", json={"ids": [t["id"]], "action": "recategorize", "category_id": pay})
    assert r.status_code == 422
    assert client.get(f"/api/transactions?category={pay}").json()["total"] == 0
    r = client.post("/api/transactions/bulk", json={"ids": [t["id"]], "action": "recategorize", "category_id": gas})
    assert r.status_code == 200


def test_delete_then_restore_is_exact(client):
    chk, card, groc, pay, t = _setup(client)
    name = client.post(f"/api/transactions/{t['id']}/receipt",
                       files={"file": ("r.jpg", b"\xff\xd8x", "image/jpeg")}).json()["receipt"]
    gone = client.delete(f"/api/transactions/{t['id']}").json()
    assert gone["receipt"] == name and client.get(f"/api/receipts/{name}").status_code == 200
    back = client.post("/api/transactions/restore", json={"rows": [{**gone, "amount": gone["amount"] / 100}]}).json()
    assert back[0] == gone  # same id, note, tags, receipt
    bulk = client.post("/api/transactions/bulk", json={"ids": [t["id"]], "action": "delete"}).json()
    assert bulk["deleted"][0]["receipt"] == name


def test_transactions_sum_by_type(client):
    chk, card, groc, pay, t = _setup(client)
    client.post("/api/transactions", json={"date": "2026-09-02", "what": "Pay", "category_id": pay, "to_id": chk,
                                           "amount": 200})
    assert client.get("/api/transactions").json()["by_type"] == {"Spending": 5000, "Money in": 20000}


def test_recurring_keeps_its_day_and_rules(client):
    chk, card, groc, pay, t = _setup(client)
    d, seen = date(2027, 1, 31), []
    for _ in range(4):
        seen.append(d.day)
        d = step(d, "monthly", 31)
    assert seen == [31, 28, 31, 30]
    base = {"label": "Pay", "category_id": pay, "amount": 100, "freq": "monthly", "next_date": "2027-01-31"}
    assert client.post("/api/recurring", json={**base, "from_account_id": chk}).status_code == 422  # income needs To
    r = client.post("/api/recurring", json={**base, "to_account_id": chk})
    assert r.status_code == 201 and r.json()["anchor_day"] == 31


def test_resuming_a_paused_template_skips_missed_dates(client):
    chk, card, groc, pay, t = _setup(client)
    past = (date.today() - timedelta(days=70)).isoformat()
    body = {"label": "Phone", "category_id": groc, "from_account_id": card, "amount": 57, "freq": "monthly",
            "next_date": past, "active": False}
    rid = client.post("/api/recurring", json=body).json()["id"]
    r = client.put(f"/api/recurring/{rid}", json={**body, "active": True}).json()
    assert r["next_date"] >= date.today().isoformat()
    client.get("/api/bootstrap")
    rows = client.get("/api/transactions?q=Phone").json()["items"]
    assert rows and all(x["date"] >= date.today().isoformat() for x in rows)


def test_account_rates_survive_a_save_that_omits_them(client):
    rid = client.post("/api/accounts", json={"name": "Loan", "kind": "loan", "loan_rate": 5.284783328599982}).json()
    client.put(f"/api/accounts/{rid['id']}", json={"name": "Student loan", "kind": "loan"})
    a = [x for x in client.get("/api/admin").json()["accounts"] if x["id"] == rid["id"]][0]
    assert a["name"] == "Student loan" and a["loan_rate"] == rid["loan_rate"]


def test_month_end_interest_without_other_income_is_a_clear_error(client):
    chk, card, groc, pay, t = _setup(client)
    r = client.post(f"/api/month-end/{date.today():%Y-%m}/interest", json={str(chk): 1.5})
    assert r.status_code == 422
