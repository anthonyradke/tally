"""Moving a recurring template's date: the app shows and edits `next_due` (the first row still ahead), and a new date
posts the rows ahead again from it, without wiping the ones already scheduled or doubling one changed by hand."""
from __future__ import annotations
from datetime import date
from .conftest import freeze

TODAY = date(2026, 9, 24)


def _rent(client, world):
    body = {"label": "Rent", "category_id": world["food"], "from_account_id": world["chk"], "amount": 1000,
            "freq": "monthly", "next_date": "2026-10-01", "horizon_days": 120}
    t = client.post("/api/recurring", json=body).json()
    client.get("/api/bootstrap")  # posts Oct 1 to Jan 1; the template's own next date is then Feb 1
    return t, body


def _rows(client):
    return [(x["date"], x["amount"]) for x in client.get("/api/transactions?q=Rent&sort=date&dir=asc").json()["items"]]


def _admin(client):
    return client.get("/api/admin").json()["recurring"][0]


def test_next_due_is_the_first_row_still_ahead(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    _rent(client, world)
    r = _admin(client)
    assert r["next_date"] == "2027-02-01" and r["next_due"] == "2026-10-01"


def test_saving_the_date_shown_keeps_the_schedule(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, body = _rent(client, world)
    client.put(f"/api/recurring/{t['id']}", json={**body, "amount": 1100, "next_date": "2026-10-01"})
    client.get("/api/bootstrap")
    assert _rows(client) == [("2026-10-01", 110000), ("2026-11-01", 110000), ("2026-12-01", 110000),
                             ("2027-01-01", 110000)]


def test_an_older_app_sending_the_templates_own_date_keeps_it_too(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, body = _rent(client, world)
    client.put(f"/api/recurring/{t['id']}", json={**body, "amount": 1100, "next_date": _admin(client)["next_date"]})
    client.get("/api/bootstrap")
    assert [d for d, _ in _rows(client)] == ["2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01"]


def test_moving_the_date_posts_again_from_it(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, body = _rent(client, world)
    r = client.put(f"/api/recurring/{t['id']}", json={**body, "next_date": "2026-10-03", "move": True}).json()
    assert r["anchor_day"] == 3
    client.get("/api/bootstrap")
    assert [d for d, _ in _rows(client)] == ["2026-10-03", "2026-11-03", "2026-12-03", "2027-01-03"]
    assert _admin(client)["next_due"] == "2026-10-03"


def test_a_move_keeps_a_row_changed_by_hand_without_doubling_its_month(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, body = _rent(client, world)
    nov = next(x for x in client.get("/api/transactions?q=Rent").json()["items"] if x["date"] == "2026-11-01")
    client.put(f"/api/transactions/{nov['id']}", json={**nov, "amount": 10})
    client.put(f"/api/recurring/{t['id']}", json={**body, "next_date": "2026-10-03"})  # no flag: a new date is a move
    client.get("/api/bootstrap")
    assert _rows(client) == [("2026-10-03", 100000), ("2026-11-01", 1000), ("2026-12-03", 100000),
                             ("2027-01-03", 100000)]


def test_moving_a_month_later_keeps_the_hand_changed_row_and_posts_the_rest(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, body = _rent(client, world)
    oct_ = next(x for x in client.get("/api/transactions?q=Rent").json()["items"] if x["date"] == "2026-10-01")
    client.put(f"/api/transactions/{oct_['id']}", json={**oct_, "note": "paid early"})
    client.put(f"/api/recurring/{t['id']}", json={**body, "next_date": "2026-11-20"})
    client.get("/api/bootstrap")
    assert [d for d, _ in _rows(client)] == ["2026-10-01", "2026-11-20", "2026-12-20", "2027-01-20"]


def test_the_move_flag_settles_a_date_that_matches_the_templates_own(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, body = _rent(client, world)
    client.put(f"/api/recurring/{t['id']}", json={**body, "next_date": "2027-02-01", "move": True})
    client.get("/api/bootstrap")
    assert _rows(client) == []  # Feb 1 is past the 120 days it posts ahead
    assert _admin(client)["next_due"] == "2027-02-01"
