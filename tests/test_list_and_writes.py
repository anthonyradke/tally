"""The transaction list's exact-name, multi-type and plain-order options; write routes off the event loop, a busy
database as a 503, a racing split, and months.csv's left over. Made-up data only."""
from __future__ import annotations
import csv
import inspect
import io
import sqlite3
from app import api, service
from .conftest import txn


def test_what_is_an_exact_name_not_a_search(client, world):
    client.post("/api/transactions", json=txn(world, what="May Market", amount=10))
    client.post("/api/transactions", json=txn(world, what="may market", amount=5))
    client.post("/api/transactions", json=txn(world, what="May Market Deli", amount=7))
    client.post("/api/transactions", json=txn(world, what="Other", note="May Market", amount=3))
    # As a search, "may" is the month and the rest a word in any field.
    assert client.get("/api/transactions", params={"q": "May Market"}).json()["total"] != 2
    r = client.get("/api/transactions", params={"what": "May Market"}).json()
    assert r["total"] == 2 and r["sum"] == 1500 and {t["what"] for t in r["items"]} == {"May Market", "may market"}
    assert r["by_type"] == {"Spending": 1500}
    for name in ("#1", "last week", "12.34", "Shop 42"):
        client.post("/api/transactions", json=txn(world, what=name))
        assert [t["what"] for t in client.get("/api/transactions", params={"what": name}).json()["items"]] == [name]
    # Other filters still apply; `q` is left out.
    r = client.get("/api/transactions", params={"what": "May Market", "q": "zzz", "amount_min": 6}).json()
    assert r["total"] == 1 and r["sum"] == 1000


def test_type_takes_a_list(client, world):
    for kind in ("spend", "in", "move", "save", "loan"):
        client.post("/api/transactions", json=txn(world, kind))
    types = lambda q: sorted({world_type(client, t) for t in client.get("/api/transactions", params={"type": q})
                              .json()["items"]})
    assert types("Transfer") == ["Transfer"]
    assert types("Transfer,Loan,Saving") == ["Loan", "Saving", "Transfer"]
    assert types(" Loan , Saving ") == ["Loan", "Saving"]
    assert client.get("/api/transactions", params={"type": "Transfer,Loan,Saving"}).json()["total"] == 3


def world_type(client, t: dict) -> str:
    cats = {c["id"]: c["type"] for c in client.get("/api/bootstrap").json()["categories"]}
    return cats[t["category_id"]]


def test_exact_amounts_first_can_be_switched_off(client, world):
    client.post("/api/transactions", json=txn(world, amount=65, date="2026-09-01"))
    client.post("/api/transactions", json=txn(world, amount=650, date="2026-09-05"))
    client.post("/api/transactions", json=txn(world, amount=65.4, date="2026-09-09"))
    dates = lambda **p: [t["date"] for t in client.get("/api/transactions", params={"q": "65", **p}).json()["items"]]
    assert dates() == ["2026-09-01", "2026-09-09", "2026-09-05"]  # old builds: the exact one first
    assert dates(exact_first=0) == ["2026-09-09", "2026-09-05", "2026-09-01"]
    assert client.get("/api/transactions", params={"q": "65", "exact_first": 0}).json()["exact"] == 1


def test_write_routes_run_in_the_threadpool():
    for route in (api.create_txn, api.create_split, api.update_txn, api.restore, api.bulk):
        assert not inspect.iscoroutinefunction(route), route.__name__


def test_a_locked_database_is_a_503(client, world, monkeypatch):
    def locked(*a, **k):
        raise sqlite3.OperationalError("database is locked")
    monkeypatch.setattr(service, "load", locked)
    r = client.post("/api/transactions", json=txn(world))
    assert r.status_code == 503 and r.json()["detail"]["errors"]


def test_a_split_that_landed_meanwhile_comes_back(client, world, monkeypatch):
    body = {"client_id": "split-race-1", "lines": [txn(world, amount=5), txn(world, amount=6)]}
    first = client.post("/api/transactions/split", json=body).json()
    real, calls = api._landed, []

    def late(con, pattern):  # the pre-check ran before the other request committed
        calls.append(pattern)
        return [] if len(calls) == 1 else real(con, pattern)
    monkeypatch.setattr(api, "_landed", late)
    again = client.post("/api/transactions/split", json=body)
    assert again.status_code == 201 and [t["id"] for t in again.json()] == [t["id"] for t in first]
    assert client.get("/api/transactions").json()["total"] == 2


def test_state_lookups_are_built_once(client, world):
    from app import db
    con = db.connect()
    try:
        st = service.load(con)
        assert st.acct is st.acct and st.cat is st.cat
    finally:
        con.close()


def test_months_csv_left_over_is_money_in_less_spent(client, world):
    client.post("/api/transactions", json=txn(world, "in", amount=1000))
    client.post("/api/transactions", json=txn(world, amount=100))
    client.post("/api/transactions", json=txn(world, "save", amount=200))
    client.post("/api/transactions", json=txn(world, "loan", amount=300))
    rows = list(csv.reader(io.StringIO(client.get("/export/months.csv").text.lstrip("﻿"))))
    sept = next(r for r in rows if r[0] == "2026-09-01")
    assert float(sept[rows[0].index("LEFT OVER")]) == 900.0
