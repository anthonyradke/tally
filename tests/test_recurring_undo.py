"""Undo of a recurring action puts back the exact schedule it had, and a move never drops or doubles a period: the
app sends `move: false` for anything that isn't a move, the old anchor day with an Undo of a move, and hand-edited
rows and skipped dates follow their month to the new day."""
from __future__ import annotations
from datetime import date
from .conftest import freeze

TODAY = date(2026, 9, 24)


def _rent(client, world, next_date="2026-10-01", horizon=120):
    body = {"label": "Rent", "category_id": world["food"], "from_account_id": world["chk"], "amount": 1000,
            "freq": "monthly", "next_date": next_date, "horizon_days": horizon}
    t = client.post("/api/recurring", json=body).json()
    client.get("/api/bootstrap")
    return t, body


def _txns(client):
    return client.get("/api/transactions?q=Rent&sort=date&dir=asc").json()["items"]


def _rows(client):
    return [(x["date"], x["amount"]) for x in _txns(client)]


def _dates(client):
    return [x["date"] for x in _txns(client)]


def _admin(client):
    return client.get("/api/admin").json()["recurring"][0]


def _slots(client):
    from app import db
    con = db.connect()
    try:
        return [r[0] for r in con.execute("SELECT slot FROM transactions WHERE recurring_id IS NOT NULL ORDER BY date")]
    finally:
        con.close()


def _edit(client, on: str, **change):
    x = next(r for r in _txns(client) if r["date"] == on)
    client.put(f"/api/transactions/{x['id']}", json={**x, "amount": x["amount"] / 100, **change})


def test_undo_of_a_pause_brings_back_the_rows_it_took_out(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, body = _rent(client, world, horizon=45)
    before = _admin(client)
    assert _dates(client) == ["2026-10-01", "2026-11-01"] and before["next_date"] == "2026-12-01"
    # The app's body comes from the list, a moment old: its next_date is the template's own date before the pause.
    stale = {**body, "next_date": before["next_date"], "move": False}
    paused = client.put(f"/api/recurring/{t['id']}", json={**stale, "active": False}).json()
    assert _dates(client) == [] and paused["active"] == 0
    client.put(f"/api/recurring/{t['id']}", json={**stale, "active": True})  # Undo
    client.get("/api/bootstrap")
    after = _admin(client)
    assert _dates(client) == ["2026-10-01", "2026-11-01"]
    assert (after["next_date"], after["anchor_day"], after["active"]) == ("2026-12-01", 1, 1)


def test_move_false_keeps_the_schedule_whatever_date_it_carries(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, body = _rent(client, world)
    client.put(f"/api/recurring/{t['id']}", json={**body, "amount": 1100, "next_date": "2026-12-15", "move": False})
    client.get("/api/bootstrap")
    assert _rows(client) == [("2026-10-01", 110000), ("2026-11-01", 110000), ("2026-12-01", 110000),
                             ("2027-01-01", 110000)]


def test_undo_of_a_move_keeps_aiming_for_the_31st(client, world, monkeypatch):
    freeze(monkeypatch, date(2026, 8, 31))
    t, body = _rent(client, world, next_date="2026-08-31", horizon=45)
    freeze(monkeypatch, date(2026, 9, 10))
    client.get("/api/bootstrap")
    before = _admin(client)
    assert before["anchor_day"] == 31 and before["next_slot"] == "2026-09-30"
    client.put(f"/api/recurring/{t['id']}", json={**body, "next_date": "2026-10-03", "move": True})
    client.get("/api/bootstrap")
    assert _admin(client)["anchor_day"] == 3
    undo = {**body, "next_date": before["next_slot"], "anchor_day": before["anchor_day"], "move": True}
    back = client.put(f"/api/recurring/{t['id']}", json=undo).json()
    assert back["anchor_day"] == 31
    freeze(monkeypatch, date(2026, 11, 20))
    client.get("/api/bootstrap")
    assert [d for d in _dates(client) if d > "2026-09-01"] == ["2026-09-30", "2026-10-31", "2026-11-30", "2026-12-31"]


def test_an_anchor_day_that_does_not_fit_the_date_is_ignored(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, body = _rent(client, world)
    r = client.put(f"/api/recurring/{t['id']}", json={**body, "next_date": "2026-10-03", "anchor_day": 31,
                                                      "move": True}).json()
    assert r["anchor_day"] == 3


def test_a_move_to_the_20th_keeps_each_month_once(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, body = _rent(client, world)
    _edit(client, "2026-11-01", amount=10)
    before = _admin(client)
    client.put(f"/api/recurring/{t['id']}", json={**body, "next_date": "2026-10-20", "move": True})
    client.get("/api/bootstrap")
    assert _rows(client) == [("2026-10-20", 100000), ("2026-11-01", 1000), ("2026-12-20", 100000),
                             ("2027-01-20", 100000)]
    # Undo: the hand-edited row stands for Nov 1 again and the rest come back on the 1st.
    client.put(f"/api/recurring/{t['id']}", json={**body, "next_date": before["next_slot"],
                                                  "anchor_day": before["anchor_day"], "move": True})
    client.get("/api/bootstrap")
    assert _rows(client) == [("2026-10-01", 100000), ("2026-11-01", 1000), ("2026-12-01", 100000),
                             ("2027-01-01", 100000)]
    assert _slots(client) == ["2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01"]


def test_a_month_paid_early_is_not_posted_again_after_a_move(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, body = _rent(client, world)
    _edit(client, "2026-11-01", date="2026-09-23")  # November's rent, paid yesterday
    client.put(f"/api/recurring/{t['id']}", json={**body, "next_date": "2026-10-20", "move": True})
    client.get("/api/bootstrap")
    assert _dates(client) == ["2026-09-23", "2026-10-20", "2026-12-20", "2027-01-20"]


def test_a_skipped_month_stays_skipped_through_a_move_and_its_undo(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, body = _rent(client, world)
    client.post(f"/api/recurring/{t['id']}/skip", json={"date": "2026-11-01"})
    before = _admin(client)
    client.put(f"/api/recurring/{t['id']}", json={**body, "next_date": "2026-10-03", "move": True})
    client.get("/api/bootstrap")
    assert _dates(client) == ["2026-10-03", "2026-12-03", "2027-01-03"]
    assert client.get("/api/admin").json()["skips"] == [{"recurring_id": t["id"], "date": "2026-11-03"}]
    client.put(f"/api/recurring/{t['id']}", json={**body, "next_date": before["next_slot"],
                                                  "anchor_day": before["anchor_day"], "move": True})
    client.get("/api/bootstrap")
    assert _dates(client) == ["2026-10-01", "2026-12-01", "2027-01-01"]
    assert client.get("/api/admin").json()["skips"] == [{"recurring_id": t["id"], "date": "2026-11-01"}]


def test_a_move_onto_a_skipped_date_says_when_it_really_starts(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, body = _rent(client, world)
    client.post(f"/api/recurring/{t['id']}/skip", json={})  # Oct 1
    r = client.put(f"/api/recurring/{t['id']}", json={**body, "next_date": "2026-10-01", "move": True}).json()
    assert r["next_due"] == "2026-11-01"


def test_a_row_moved_by_hand_is_next_on_its_own_date_and_can_be_skipped(client, world, monkeypatch):
    freeze(monkeypatch, date(2026, 9, 28))
    t, _ = _rent(client, world, horizon=45)  # Oct 1 and Nov 1
    _edit(client, "2026-10-01", date="2026-10-08")  # paid late
    freeze(monkeypatch, date(2026, 10, 3))
    client.get("/api/bootstrap")
    r = _admin(client)
    assert (r["next_due"], r["next_slot"]) == ("2026-10-08", "2026-10-01")
    s = client.post(f"/api/recurring/{t['id']}/skip", json={})
    assert s.status_code == 200 and [x["date"] for x in s.json()["rows"]] == ["2026-10-08"]
    assert _dates(client) == ["2026-11-01"]
    client.get("/api/bootstrap")
    assert _dates(client) == ["2026-11-01"]  # October isn't posted again
    back = [{**x, "amount": x["amount"] / 100} for x in s.json()["rows"]]
    assert client.post("/api/transactions/restore", json={"rows": back}).status_code == 201
    assert _dates(client) == ["2026-10-08", "2026-11-01"]


def test_a_date_from_before_midnight_is_not_a_move(client, world, monkeypatch):
    freeze(monkeypatch, date(2026, 8, 31))
    t, body = _rent(client, world, next_date="2026-08-31", horizon=45)  # aims for the 31st
    freeze(monkeypatch, date(2026, 10, 1))
    client.get("/api/bootstrap")
    # An older app sends the next date it read yesterday, Sep 30, now in the past.
    r = client.put(f"/api/recurring/{t['id']}", json={**body, "amount": 1100, "next_date": "2026-09-30"}).json()
    client.get("/api/bootstrap")
    assert r["anchor_day"] == 31
    assert _rows(client) == [("2026-08-31", 100000), ("2026-09-30", 100000), ("2026-10-31", 110000)]


def test_a_move_to_a_past_date_carries_on_from_today_without_a_backlog(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, body = _rent(client, world, horizon=45)
    r = client.put(f"/api/recurring/{t['id']}", json={**body, "next_date": "2026-08-05", "move": True}).json()
    client.get("/api/bootstrap")
    assert r["next_date"] == "2026-10-05" and r["anchor_day"] == 5
    assert _dates(client) == ["2026-10-05", "2026-11-05"]


def test_saving_returns_the_dates_the_app_shows(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t, body = _rent(client, world)
    r = client.put(f"/api/recurring/{t['id']}", json={**body, "amount": 1100, "move": False}).json()
    assert (r["next_due"], r["next_slot"]) == ("2026-10-01", "2026-10-01")
