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


def test_editing_a_template_replaces_its_rows_still_ahead(client, world, monkeypatch):
    from .conftest import freeze
    freeze(monkeypatch, date(2026, 9, 24))
    base = {"label": "Rent", "category_id": world["food"], "from_account_id": world["chk"], "amount": 1400,
            "freq": "monthly", "next_date": "2026-09-24", "horizon_days": 45}
    t = client.post("/api/recurring", json=base).json()
    client.get("/api/bootstrap")
    rows = lambda: [(x["date"], x["amount"]) for x in client.get("/api/transactions?q=Rent&sort=date&dir=asc").json()["items"]]
    assert rows() == [("2026-09-24", 140000), ("2026-10-24", 140000)]
    cur = client.get("/api/admin").json()["recurring"][0]
    client.put(f"/api/recurring/{t['id']}", json={**base, "next_date": cur["next_date"], "amount": 1500})
    client.get("/api/bootstrap")
    assert rows() == [("2026-09-24", 140000), ("2026-10-24", 150000)]  # today's stays; the one ahead takes the new amount
    # Moving the date earlier no longer doubles a month.
    client.put(f"/api/recurring/{t['id']}", json={**base, "next_date": "2026-10-20", "amount": 1500})
    client.get("/api/bootstrap")
    assert rows() == [("2026-09-24", 140000), ("2026-10-20", 150000)]


def test_pausing_takes_out_rows_ahead_and_resuming_brings_them_back(client, world, monkeypatch):
    from .conftest import freeze
    freeze(monkeypatch, date(2026, 9, 24))
    base = {"label": "Gym", "category_id": world["food"], "from_account_id": world["chk"], "amount": 20,
            "freq": "monthly", "next_date": "2026-10-01", "horizon_days": 45}
    t = client.post("/api/recurring", json=base).json()
    client.get("/api/bootstrap")
    nxt = client.get("/api/admin").json()["recurring"][0]["next_date"]
    client.put(f"/api/recurring/{t['id']}", json={**base, "next_date": nxt, "active": False})
    assert client.get("/api/transactions?q=Gym").json()["items"] == []
    assert client.get("/api/admin").json()["recurring"][0]["next_date"] == "2026-10-01"
    client.put(f"/api/recurring/{t['id']}", json={**base, "next_date": "2026-10-01"})
    client.get("/api/bootstrap")
    assert [x["date"] for x in client.get("/api/transactions?q=Gym&sort=date&dir=asc").json()["items"]] == ["2026-10-01", "2026-11-01"]


def test_a_scheduled_row_changed_by_hand_survives_a_template_edit(client, world, monkeypatch):
    from .conftest import freeze
    freeze(monkeypatch, date(2026, 9, 24))
    base = {"label": "Rent", "category_id": world["food"], "from_account_id": world["chk"], "amount": 1400,
            "freq": "monthly", "next_date": "2026-10-01", "horizon_days": 45}
    t = client.post("/api/recurring", json=base).json()
    client.get("/api/bootstrap")
    first = client.get("/api/transactions?q=Rent&sort=date&dir=asc").json()["items"][0]
    client.put(f"/api/transactions/{first['id']}", json={**first, "amount": 1450, "note": "late fee"})
    nxt = client.get("/api/admin").json()["recurring"][0]["next_date"]
    client.put(f"/api/recurring/{t['id']}", json={**base, "next_date": nxt, "amount": 1500})
    client.get("/api/bootstrap")
    got = [(x["date"], x["amount"]) for x in client.get("/api/transactions?q=Rent&sort=date&dir=asc").json()["items"]]
    assert got == [("2026-10-01", 145000), ("2026-11-01", 150000)]


def test_an_entry_from_before_the_start_month_can_still_be_edited(client, world):
    tid = client.post("/api/transactions", json=txn(world, date="2026-08-05")).json()["id"]
    client.put("/api/settings", json={"start_month": "2026-09-01"})
    assert client.put(f"/api/transactions/{tid}", json=txn(world, date="2026-08-05", note="kept")).status_code == 200
    assert client.put(f"/api/transactions/{tid}", json=txn(world, date="2026-08-06")).status_code == 422
