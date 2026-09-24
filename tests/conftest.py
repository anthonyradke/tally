"""Shared fixtures. Every test gets its own throwaway database and receipts folder; nothing here can reach
data/tally.db. All data is made up."""
from __future__ import annotations
import os
import tempfile
from datetime import date
import pytest
from fastapi.testclient import TestClient

# Before any app module is imported (test modules import them at collection): point every path the app reads at a
# throwaway folder. api_files reads TALLY_RECEIPTS once at import, and db.connect() falls back to data/tally.db, so
# without this a stray call could reach the real data folder of whichever checkout pytest runs in.
_SAFE = tempfile.mkdtemp(prefix="tally-tests-")
for _key, _name in (("TALLY_DB", "stray.db"), ("TALLY_RECEIPTS", "receipts"), ("TALLY_BACKUPS", "backups")):
    os.environ[_key] = os.path.join(_SAFE, _name)


@pytest.fixture(autouse=True)
def _own_folders(tmp_path, monkeypatch):
    """Every test, including ones with their own client fixture, gets its own receipts folder and database."""
    from app import api_files
    monkeypatch.setenv("TALLY_DB", str(tmp_path / "t.db"))
    monkeypatch.setenv("TALLY_RECEIPTS", str(tmp_path / "receipts"))
    monkeypatch.setattr(api_files, "RECEIPTS", tmp_path / "receipts")
    monkeypatch.setattr(api_files, "_swept", 0.0)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TALLY_DB", str(tmp_path / "t.db"))
    monkeypatch.setenv("TALLY_RECEIPTS", str(tmp_path / "receipts"))
    monkeypatch.setenv("TALLY_BACKUPS", str(tmp_path / "backups"))
    from app import api_files
    from app.main import app
    monkeypatch.setattr(api_files, "RECEIPTS", tmp_path / "receipts")
    monkeypatch.setattr(api_files, "_swept", 0.0)
    return TestClient(app, raise_server_exceptions=False)


def freeze(monkeypatch, today: date) -> None:
    """Pin date.today() everywhere the app reads it (the server's local date, TZ=America/Denver in production)."""
    class Fixed(date):
        @classmethod
        def today(cls):
            return today
    from app import api, api_recurring, service
    for mod in (api, api_recurring, service):
        monkeypatch.setattr(mod, "date", Fixed)


@pytest.fixture
def world(client):
    """A small made-up ledger: two cash accounts, a card, an investment, a loan and one category per type."""
    post = lambda url, body: client.post(url, json=body).json()
    a = {
        "chk": post("/api/accounts", {"name": "Checking", "kind": "cash", "start_balance": 1000})["id"],
        "sav": post("/api/accounts", {"name": "Savings", "kind": "cash", "start_balance": 5000, "apy": 4, "ef": True})["id"],
        "card": post("/api/accounts", {"name": "Card", "kind": "card"})["id"],
        "ira": post("/api/accounts", {"name": "IRA", "kind": "investment", "start_balance": 2000})["id"],
        "loan": post("/api/accounts", {"name": "Loan", "kind": "loan", "start_balance": 10000, "loan_rate": 6})["id"],
    }
    c = {
        "pay": post("/api/categories", {"name": "Paycheck", "type": "Money in"})["id"],
        "interest": post("/api/categories", {"name": "Other Income", "type": "Money in"})["id"],
        "food": post("/api/categories", {"name": "Groceries", "type": "Spending"})["id"],
        "gas": post("/api/categories", {"name": "Gas", "type": "Spending"})["id"],
        "move": post("/api/categories", {"name": "Transfer", "type": "Transfer"})["id"],
        "roth": post("/api/categories", {"name": "Roth IRA", "type": "Saving"})["id"],
        "loanpay": post("/api/categories", {"name": "Loan payment", "type": "Loan"})["id"],
    }
    return {**a, **c}


def txn(w: dict, kind: str = "spend", **kw) -> dict:
    """A valid entry body for `world` (dollars, as the app sends)."""
    base = {
        "spend": {"category_id": w["food"], "from_id": w["card"], "to_id": None, "what": "Market"},
        "in": {"category_id": w["pay"], "from_id": None, "to_id": w["chk"], "what": "Paycheck"},
        "move": {"category_id": w["move"], "from_id": w["chk"], "to_id": w["sav"], "what": "To savings"},
        "save": {"category_id": w["roth"], "from_id": w["chk"], "to_id": None, "what": "Roth"},
        "loan": {"category_id": w["loanpay"], "from_id": w["chk"], "to_id": w["loan"], "what": "Loan"},
    }[kind]
    return {"date": "2026-09-10", "amount": 12.34, **base, **kw}
