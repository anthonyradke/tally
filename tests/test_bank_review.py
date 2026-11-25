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
