"""End-to-end checks for the JSON API against a throwaway database (TALLY_DB points at tmp_path)."""
from datetime import date, timedelta
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TALLY_DB", str(tmp_path / "t.db"))
    monkeypatch.setenv("TALLY_RECEIPTS", str(tmp_path / "receipts"))
    from app.main import app
    return TestClient(app)


def _setup(c):
    checking = c.post("/api/accounts", json={"name": "Checking", "kind": "cash", "start_balance": 100}).json()
    card = c.post("/api/accounts", json={"name": "Card", "kind": "card"}).json()
    groc = c.post("/api/categories", json={"name": "Groceries", "type": "Spending"}).json()
    gas = c.post("/api/categories", json={"name": "Gas", "type": "Spending"}).json()
    pay = c.post("/api/categories", json={"name": "Paycheck", "type": "Money in"}).json()
    return checking, card, groc, gas, pay


def test_validation_and_meta(client):
    checking, card, groc, gas, pay = _setup(client)
    r = client.post("/api/transactions", json={"date": "2026-09-01", "what": "x", "category_id": pay["id"],
                                               "from_id": checking["id"], "to_id": None, "amount": 5})
    assert r.status_code == 422 and "From must be blank" in " ".join(r.json()["detail"]["errors"])

    r = client.post("/api/transactions", json={"date": "2026-09-02", "what": "Costco", "category_id": groc["id"],
                                               "from_id": card["id"], "to_id": None, "amount": 12.34,
                                               "note": "bulk run", "tags": ["#Camping", "lex"]})
    assert r.status_code == 201
    t = r.json()
    assert t["amount"] == 1234 and t["tags"] == ["camping", "lex"] and t["note"] == "bulk run"
    assert client.get("/api/transactions?q=camping").json()["total"] == 1
    assert client.get("/api/transactions?tag=lex").json()["total"] == 1
    assert client.get("/api/transactions?q=12.34").json()["total"] == 1


def test_split_bulk_sort(client):
    checking, card, groc, gas, pay = _setup(client)
    line = lambda cat, amt, what: {"date": "2026-09-03", "what": what, "category_id": cat["id"],
                                   "from_id": card["id"], "to_id": None, "amount": amt}
    r = client.post("/api/transactions/split", json={"lines": [line(groc, 200, "Costco"), line(gas, 40, "Costco gas")]})
    assert r.status_code == 201
    lines = r.json()
    assert len(lines) == 2 and lines[0]["split_group"] == lines[1]["split_group"]
    g = client.get(f"/api/transactions?group={lines[0]['split_group']}").json()
    assert g["total"] == 2 and g["sum"] == 24000

    assert client.post("/api/transactions/split", json={"lines": [line(groc, 5, "solo")]}).status_code == 422

    amounts = [x["amount"] for x in client.get("/api/transactions?sort=amount&dir=asc").json()["items"]]
    assert amounts == sorted(amounts)

    ids = [x["id"] for x in lines]
    client.post("/api/transactions/bulk", json={"ids": ids, "action": "tag", "tags": ["costco"]})
    assert client.get("/api/transactions?tag=costco").json()["total"] == 2
    client.post("/api/transactions/bulk", json={"ids": [ids[1]], "action": "recategorize", "category_id": groc["id"]})
    assert client.get(f"/api/transactions?category={groc['id']}").json()["total"] == 2
    client.post("/api/transactions/bulk", json={"ids": ids, "action": "delete"})
    assert client.get("/api/transactions").json()["total"] == 0


def test_recurring_generates_once(client):
    checking, card, groc, gas, pay = _setup(client)
    start = (date.today() - timedelta(days=40)).isoformat()
    client.post("/api/recurring", json={"label": "Phone", "category_id": groc["id"], "from_account_id": checking["id"],
                                        "amount": 57, "freq": "monthly", "next_date": start})
    boot = client.get("/api/bootstrap").json()
    gen = client.get("/api/transactions?q=Phone").json()
    assert gen["total"] >= 2 and all(x["recurring_id"] for x in gen["items"])
    assert all(x["amount"] == 5700 for x in gen["items"])
    assert boot["recurring"][0]["next_date"] > (date.today() + timedelta(days=14)).isoformat()
    client.get("/api/bootstrap")
    assert client.get("/api/transactions?q=Phone").json()["total"] == gen["total"]
    # deleting the template removes only rows still in the future
    rid = boot["recurring"][0]["id"]
    client.delete(f"/api/recurring/{rid}")
    left = client.get("/api/transactions?q=Phone").json()
    assert all(x["date"] <= date.today().isoformat() for x in left["items"])


def test_budgets_and_receipts(client):
    checking, card, groc, gas, pay = _setup(client)
    client.put(f"/api/budgets/{groc['id']}", json={"amount": 400})
    assert client.get("/api/bootstrap").json()["categories"][0]["budget"] == 40000
    client.put(f"/api/budgets/{groc['id']}", json={"amount": 300, "month": "2026-09-01"})
    assert client.get("/api/bootstrap").json()["budgets"] == [{"category_id": groc["id"], "month": "2026-09-01", "amount": 30000}]
    client.put(f"/api/budgets/{groc['id']}", json={"amount": None, "month": "2026-09-01"})
    assert client.get("/api/bootstrap").json()["budgets"] == []

    t = client.post("/api/transactions", json={"date": "2026-09-02", "what": "Costco", "category_id": groc["id"],
                                               "from_id": card["id"], "to_id": None, "amount": 1}).json()
    r = client.post(f"/api/transactions/{t['id']}/receipt", files={"file": ("r.png", b"\x89PNG fake", "image/png")})
    assert r.status_code == 200
    name = r.json()["receipt"]
    assert client.get(f"/api/receipts/{name}").status_code == 200
    # Traversal: an encoded name stays inside the receipts route and must be rejected; a normalized one matches
    # no route at all. Neither may ever return a file outside data/receipts.
    assert client.get("/api/receipts/%2e%2e%2f%2e%2e%2fetc%2fpasswd").status_code == 404
    assert b"root:" not in client.get("/api/receipts/../../etc/passwd").content
    assert client.post(f"/api/transactions/{t['id']}/receipt", files={"file": ("r.txt", b"x", "text/plain")}).status_code == 422
    client.delete(f"/api/transactions/{t['id']}")
    assert client.get(f"/api/receipts/{name}").status_code == 200  # kept for Undo until the sweep
    from app import db
    from app.api_files import sweep
    assert sweep(db.connect(), grace=0, every=0) == 1
    assert client.get(f"/api/receipts/{name}").status_code == 404


def test_settings_and_reorder(client):
    checking, card, groc, gas, pay = _setup(client)
    assert client.put("/api/settings", json={"roth_limit": 7000, "ef_months": "3"}).json()["roth_limit"] == "700000"
    assert client.put("/api/settings", json={"nope": 1}).status_code == 422
    client.put("/api/categories/order", json={"ids": [pay["id"], gas["id"], groc["id"]]})
    names = [c["name"] for c in client.get("/api/admin").json()["categories"]]
    assert names == ["Paycheck", "Gas", "Groceries"]
    assert client.delete(f"/api/accounts/{card['id']}").status_code == 204
