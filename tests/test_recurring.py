"""Recurring templates: posting ahead, short months, leap years, pausing, editing and deleting after posting,
running twice. Dates are pinned with freeze() so the tests don't depend on the day they run."""
from __future__ import annotations
import sqlite3
import threading
from datetime import date, timedelta
import pytest
from hypothesis import given, strategies as st
from app import db
from app.recurring import first_on_or_after, generate, step
from .conftest import freeze

TODAY = date(2026, 9, 24)


def tmpl(w, **kw):
    return {"label": "Rent", "category_id": w["food"], "from_account_id": w["chk"], "amount": 1400,
            "freq": "monthly", "next_date": "2026-10-01", **kw}


def dates(client, what="Rent"):
    return [x["date"] for x in client.get(f"/api/transactions?q={what}&sort=date&dir=asc&limit=1000").json()["items"]]


# ---------- step ----------

def test_31st_lands_on_the_last_day_then_comes_back():
    d, out = date(2026, 1, 31), []
    for _ in range(6):
        out.append(d)
        d = step(d, "monthly", 31)
    assert out == [date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30), date(2026, 5, 31),
                   date(2026, 6, 30)]


def test_29th_and_30th_in_february():
    assert step(date(2028, 1, 29), "monthly", 29) == date(2028, 2, 29)  # leap year keeps the 29th
    assert step(date(2027, 1, 29), "monthly", 29) == date(2027, 2, 28)
    assert step(date(2027, 2, 28), "monthly", 30) == date(2027, 3, 30)


def test_yearly_leap_day():
    d, out = date(2028, 2, 29), []
    for _ in range(5):
        out.append(d)
        d = step(d, "yearly", 29)
    assert out == [date(2028, 2, 29), date(2029, 2, 28), date(2030, 2, 28), date(2031, 2, 28), date(2032, 2, 29)]


def test_weekly_and_biweekly_cross_dst():
    """Dates carry no time, so the DST switches in America/Denver (Mar 8 and Nov 1, 2026) can't shift a weekday."""
    assert step(date(2026, 3, 5), "weekly") == date(2026, 3, 12)
    assert step(date(2026, 10, 29), "biweekly") == date(2026, 11, 12)
    assert step(date(2026, 10, 29), "biweekly").weekday() == date(2026, 10, 29).weekday()


@given(st.dates(min_value=date(2000, 1, 1), max_value=date(2090, 1, 1)), st.integers(1, 31),
       st.sampled_from(["weekly", "biweekly", "monthly", "yearly"]))
def test_step_always_moves_forward_and_keeps_the_anchor(d, anchor, freq):
    n = step(d, freq, anchor)
    assert n > d
    if freq in ("monthly", "yearly"):
        assert n.day == anchor or (n + timedelta(days=1)).day == 1  # the anchor, or the month's last day


@given(st.dates(min_value=date(2020, 1, 1), max_value=date(2030, 1, 1)),
       st.dates(min_value=date(2020, 1, 1), max_value=date(2030, 1, 1)))
def test_resume_skips_missed_dates(d, today):
    n = first_on_or_after(d, "weekly", None, today)
    if d >= today:
        assert n == d
    else:
        assert today <= n < today + timedelta(days=7) and (n - d).days % 7 == 0


# ---------- generate through the API ----------

def test_posts_ahead_once_and_is_idempotent(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    r = client.post("/api/recurring", json=tmpl(world))
    assert r.status_code == 201 and r.json()["anchor_day"] == 1
    client.get("/api/bootstrap")
    assert dates(client) == ["2026-10-01", "2026-11-01"]  # horizon 45 days: up to Nov 8
    for _ in range(3):
        client.get("/api/bootstrap")
    assert dates(client) == ["2026-10-01", "2026-11-01"]
    rows = client.get("/api/transactions?q=Rent").json()["items"]
    assert {x["amount"] for x in rows} == {140000} and all(x["recurring_id"] for x in rows)


def test_a_past_start_posts_the_backlog(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    client.post("/api/recurring", json=tmpl(world, freq="weekly", next_date="2026-09-01", horizon_days=0))
    client.get("/api/bootstrap")
    assert dates(client) == ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"]


def test_the_31st_through_the_api(client, world, monkeypatch):
    freeze(monkeypatch, date(2027, 1, 20))
    client.post("/api/recurring", json=tmpl(world, next_date="2027-01-31", horizon_days=130))  # up to May 30
    client.get("/api/bootstrap")
    assert dates(client) == ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]


def test_pause_and_resume_skips_the_gap(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t = client.post("/api/recurring", json=tmpl(world, horizon_days=0, next_date="2026-09-24")).json()
    client.get("/api/bootstrap")
    assert dates(client) == ["2026-09-24"]
    paused = client.put(f"/api/recurring/{t['id']}", json=tmpl(world, horizon_days=0, next_date="2026-10-24",
                                                               active=False)).json()
    assert paused["active"] == 0
    freeze(monkeypatch, date(2027, 1, 2))
    client.get("/api/bootstrap")
    assert dates(client) == ["2026-09-24"]  # nothing while paused
    resumed = client.put(f"/api/recurring/{t['id']}", json=tmpl(world, horizon_days=0, next_date="2026-10-24")).json()
    assert resumed["next_date"] == "2027-01-24" and resumed["anchor_day"] == 24
    client.get("/api/bootstrap")
    assert dates(client) == ["2026-09-24"]


def test_editing_keeps_the_anchor_when_the_date_is_unchanged(client, world, monkeypatch):
    freeze(monkeypatch, date(2027, 1, 20))
    t = client.post("/api/recurring", json=tmpl(world, next_date="2027-01-31", horizon_days=15)).json()
    client.get("/api/bootstrap")
    t = client.get("/api/admin").json()["recurring"][0]
    assert t["next_date"] == "2027-02-28" and t["anchor_day"] == 31
    t2 = client.put(f"/api/recurring/{t['id']}", json=tmpl(world, next_date="2027-02-28", amount=1500)).json()
    assert t2["anchor_day"] == 31 and t2["amount"] == 150000


def test_edits_and_deletes_of_posted_rows_stick(client, world, monkeypatch):
    """Generated rows are ordinary entries: editing or deleting one never brings it back."""
    freeze(monkeypatch, TODAY)
    client.post("/api/recurring", json=tmpl(world))
    client.get("/api/bootstrap")
    rows = client.get("/api/transactions?q=Rent&sort=date&dir=asc").json()["items"]
    body = {"date": rows[0]["date"], "what": "Rent", "category_id": world["food"], "from_id": world["chk"],
            "amount": 1450}
    assert client.put(f"/api/transactions/{rows[0]['id']}", json=body).status_code == 200
    client.delete(f"/api/transactions/{rows[1]['id']}")
    client.get("/api/bootstrap")
    left = client.get("/api/transactions?q=Rent").json()["items"]
    assert [x["amount"] for x in left] == [145000]


def test_delete_template_removes_only_future_rows(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t = client.post("/api/recurring", json=tmpl(world, freq="weekly", next_date="2026-09-10")).json()
    client.get("/api/bootstrap")
    assert client.delete(f"/api/recurring/{t['id']}").status_code == 204
    assert dates(client) == ["2026-09-10", "2026-09-17", "2026-09-24"]  # today's row has happened
    assert client.get("/api/admin").json()["recurring"] == []
    assert client.delete(f"/api/recurring/{t['id']}").status_code == 204  # deleting again is harmless


def test_templates_follow_the_from_to_rules(client, world):
    bad = tmpl(world, category_id=world["pay"])  # income with a From
    r = client.post("/api/recurring", json=bad)
    assert r.status_code == 422 and any("From must be blank" in e for e in r.json()["detail"]["errors"])
    assert client.post("/api/recurring", json=tmpl(world, freq="daily")).status_code == 422
    assert client.post("/api/recurring", json=tmpl(world, label="  ")).status_code == 422
    assert client.post("/api/recurring", json=tmpl(world, amount=0)).status_code == 422


def test_a_huge_horizon_is_refused(client, world):
    """horizon_days is how far ahead rows post. A typo like 45000 would write thousands of rows on the next open."""
    r = client.post("/api/recurring", json=tmpl(world, freq="weekly", horizon_days=45000))
    assert r.status_code == 422
    assert client.post("/api/recurring", json=tmpl(world, horizon_days=-5)).status_code == 422


def test_concurrent_generate_posts_each_date_once(tmp_path):
    """Two devices opening the app together: generate() re-reads under a write lock, so no date posts twice."""
    path = str(tmp_path / "r.db")
    con = db.connect(path)
    con.execute("INSERT INTO accounts(name,kind) VALUES('A','cash')")
    con.execute("INSERT INTO categories(name,type) VALUES('C','Spending')")
    con.execute("INSERT INTO recurring(label,category_id,from_account_id,amount,freq,next_date,anchor_day)"
                " VALUES('R',1,1,100,'weekly','2026-01-01',1)")
    con.commit()
    errors = []

    def run():
        c = sqlite3.connect(path, check_same_thread=False)
        c.row_factory = sqlite3.Row
        try:
            generate(c, date(2026, 6, 1))
        except Exception as e:  # pragma: no cover - reported below
            errors.append(e)
        finally:
            c.close()
    threads = [threading.Thread(target=run) for _ in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors
    got = [r[0] for r in con.execute("SELECT date FROM transactions ORDER BY date")]
    assert len(got) == len(set(got)) and got[0] == "2026-01-01"


@pytest.mark.parametrize("freq", ["weekly", "biweekly", "monthly", "yearly"])
def test_generate_twice_same_day_is_a_no_op(tmp_path, freq):
    con = db.connect(str(tmp_path / "g.db"))
    con.execute("INSERT INTO accounts(name,kind) VALUES('A','cash')")
    con.execute("INSERT INTO categories(name,type) VALUES('C','Spending')")
    con.execute("INSERT INTO recurring(label,category_id,from_account_id,amount,freq,next_date,anchor_day)"
                " VALUES('R',1,1,100,?,'2026-01-31',31)", (freq,))
    con.commit()
    first = generate(con, date(2027, 3, 1))
    assert first > 0 and generate(con, date(2027, 3, 1)) == 0
