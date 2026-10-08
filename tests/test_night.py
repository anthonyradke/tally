"""Fixes from the 2026-10-08 overnight pass."""
from __future__ import annotations
from datetime import date
from .conftest import txn


def test_a_date_years_away_is_refused_and_bootstrap_keeps_working(client, world):
    r = client.post("/api/transactions", json=txn(world, date="9999-12-31"))
    assert r.status_code == 422 and "ten years" in r.json()["detail"]["errors"][0]
    split = {"lines": [txn(world, date="2999-01-01"), txn(world, date="2999-01-01")]}
    assert client.post("/api/transactions/split", json=split).status_code == 422
    assert client.get("/api/bootstrap").status_code == 200


def test_an_entry_before_the_start_month_is_refused(client, world):
    r = client.post("/api/transactions", json=txn(world, date="2026-07-31"))  # start month is 2026-08-01
    assert r.status_code == 422 and "starts counting in August 2026" in r.json()["detail"]["errors"][0]
    tid = client.post("/api/transactions", json=txn(world)).json()["id"]
    assert client.put(f"/api/transactions/{tid}", json=txn(world, date="2026-01-01")).status_code == 422


def test_undo_still_puts_back_a_row_from_before_the_start_month(client, world):
    tid = client.post("/api/transactions", json=txn(world)).json()["id"]
    gone = client.delete(f"/api/transactions/{tid}").json()
    client.put("/api/settings", json={"start_month": "2026-09-01"})
    back = client.post("/api/transactions/restore", json={"rows": [{**gone, "amount": gone["amount"] / 100}]})
    assert back.status_code == 201


def test_start_month_cannot_be_in_the_future(client):
    nxt = date.today().replace(day=1).replace(year=date.today().year + 1)
    assert client.put("/api/settings", json={"start_month": nxt.isoformat()}).status_code == 422
    assert client.put("/api/settings", json={"start_month": "2026-08-01"}).status_code == 200


def test_recurring_dates_are_checked(client, world):
    base = {"label": "Rent", "category_id": world["gas"], "from_account_id": world["chk"], "amount": 900, "freq": "monthly"}
    assert client.post("/api/recurring", json={**base, "next_date": "2026-07-01"}).status_code == 422  # a backlog before start
    assert client.post("/api/recurring", json={**base, "next_date": "2026-07-01", "active": False}).status_code == 201
    assert client.post("/api/recurring", json={**base, "next_date": "2999-01-01"}).status_code == 422


def test_negative_limit_and_offset_are_ignored(client, world):
    for _ in range(3):
        client.post("/api/transactions", json=txn(world))
    assert client.get("/api/transactions?limit=-1").json()["items"] == []
    assert len(client.get("/api/transactions?offset=-2").json()["items"]) == 3
