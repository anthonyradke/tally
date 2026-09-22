"""2026-09-22 features: outbox retries don't double up, Roth/interest categories survive a rename, backup status."""
import os
from datetime import date
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TALLY_DB", str(tmp_path / "t.db"))
    monkeypatch.setenv("TALLY_BACKUPS", str(tmp_path / "backups"))
    from app.main import app
    return TestClient(app)


def _ids(c):
    card = c.post("/api/accounts", json={"name": "Card", "kind": "card"}).json()["id"]
    groc = c.post("/api/categories", json={"name": "Groceries", "type": "Spending"}).json()["id"]
    dine = c.post("/api/categories", json={"name": "Dining", "type": "Spending"}).json()["id"]
    return card, groc, dine


def _count(c):
    return c.get("/api/transactions").json()["total"]


def test_retried_create_returns_the_first_row(client):
    card, groc, _ = _ids(client)
    body = {"date": date.today().isoformat(), "what": "Costco", "category_id": groc, "from_id": card,
            "amount": 12.5, "client_id": "a1b2c3d4-e5f6"}
    first = client.post("/api/transactions", json=body)
    again = client.post("/api/transactions", json=body)
    assert first.status_code == again.status_code == 201
    assert first.json()["id"] == again.json()["id"] and _count(client) == 1
    # without a client_id, the same body is a new entry
    assert client.post("/api/transactions", json={**body, "client_id": None}).json()["id"] != first.json()["id"]
    assert client.post("/api/transactions", json={**body, "client_id": "../x"}).status_code == 422


def test_retried_split_returns_every_line(client):
    card, groc, dine = _ids(client)
    line = {"date": date.today().isoformat(), "what": "Target", "from_id": card}
    body = {"client_id": "split-0001", "lines": [{**line, "category_id": groc, "amount": 30},
                                                  {**line, "category_id": dine, "amount": 8}]}
    first = client.post("/api/transactions/split", json=body).json()
    again = client.post("/api/transactions/split", json=body).json()
    assert sorted(t["id"] for t in first) == sorted(t["id"] for t in again)
    assert _count(client) == 2


def test_roth_widget_survives_renaming_the_category(client):
    card, _, _ = _ids(client)
    chk = client.post("/api/accounts", json={"name": "Checking", "kind": "cash", "start_balance": 900}).json()["id"]
    roth = client.post("/api/categories", json={"name": "Roth IRA", "type": "Saving"}).json()["id"]
    client.post("/api/transactions", json={"date": date.today().isoformat(), "what": "", "category_id": roth,
                                           "from_id": chk, "amount": 100})
    assert client.get("/api/bootstrap").json()["roth"]["ytd"] == 10000  # found by name while nothing is pinned
    client.put("/api/settings", json={"roth_category": roth})
    client.put(f"/api/categories/{roth}", json={"name": "Retirement", "type": "Saving"})
    assert client.get("/api/bootstrap").json()["roth"]["ytd"] == 10000
    assert client.put("/api/settings", json={"roth_category": 9999}).status_code == 422
    client.put("/api/settings", json={"roth_category": None})
    assert client.get("/api/bootstrap").json()["roth"] == {"ytd": 0, "limit": 750000, "category_id": None}


def test_interest_uses_the_picked_category(client):
    chk = client.post("/api/accounts", json={"name": "HYSA", "kind": "cash", "apy": 4}).json()["id"]
    inc = client.post("/api/categories", json={"name": "Interest", "type": "Money in"}).json()["id"]
    assert client.post("/api/month-end/2026-08/interest", json={str(chk): 3}).status_code == 422
    client.put("/api/settings", json={"interest_category": inc})
    assert client.post("/api/month-end/2026-08/interest", json={str(chk): 3}).status_code == 200
    assert client.get(f"/api/transactions?category={inc}").json()["total"] == 1


def test_backup_status(client, tmp_path):
    assert client.get("/api/backups").json()["latest"] is None
    folder = tmp_path / "backups"
    folder.mkdir()
    for name in ("tally-2026-09-20.db", "tally-2026-09-21.db", "tally-pre-audit.db"):
        (folder / name).write_bytes(b"x" * 10)
    os.utime(folder / "tally-2026-09-21.db", (1_790_000_000, 1_790_000_000))
    r = client.get("/api/backups").json()
    assert r["count"] == 2 and r["latest"]["name"] == "tally-2026-09-21.db" and r["latest"]["size"] == 10
