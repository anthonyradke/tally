"""A template started from an entry on the 29th to 31st: its first date can be a short month's last day, and
`anchor_day` keeps it aiming for the entry's day after that instead of settling on the short month's."""
from __future__ import annotations
from datetime import date
from .conftest import freeze


def tmpl(w, **kw):
    return {"label": "Gym", "category_id": w["food"], "from_account_id": w["chk"], "amount": 40,
            "freq": "monthly", "horizon_days": 130, **kw}


def dates(client):
    return [x["date"] for x in client.get("/api/transactions?q=Gym&sort=date&dir=asc&limit=1000").json()["items"]]


def test_a_feb_28_start_aiming_for_the_31st_comes_back_to_it(client, world, monkeypatch):
    freeze(monkeypatch, date(2027, 2, 1))
    r = client.post("/api/recurring", json=tmpl(world, next_date="2027-02-28", anchor_day=31))
    assert r.status_code == 201 and r.json()["anchor_day"] == 31
    client.get("/api/bootstrap")  # up to Jun 11
    assert dates(client) == ["2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31"]


def test_without_an_anchor_it_aims_for_the_first_date(client, world, monkeypatch):
    freeze(monkeypatch, date(2027, 2, 1))
    r = client.post("/api/recurring", json=tmpl(world, next_date="2027-02-28"))
    assert r.json()["anchor_day"] == 28


def test_an_anchor_that_doesnt_fit_the_date_is_dropped(client, world, monkeypatch):
    freeze(monkeypatch, date(2027, 2, 1))
    # Not a month's last day: a later anchor would post on the 15th, then the 31st.
    assert client.post("/api/recurring", json=tmpl(world, next_date="2027-03-15", anchor_day=31)).json()["anchor_day"] == 15
    # An earlier day than the date's own is never right either.
    assert client.post("/api/recurring", json=tmpl(world, next_date="2027-02-28", anchor_day=3)).json()["anchor_day"] == 28
    # Weekly doesn't aim for a day of the month.
    weekly = tmpl(world, next_date="2027-02-28", anchor_day=31, freq="weekly")
    assert client.post("/api/recurring", json=weekly).json()["anchor_day"] == 28


def test_a_bad_anchor_is_refused(client, world, monkeypatch):
    freeze(monkeypatch, date(2027, 2, 1))
    for v in (0, 32, "x"):
        r = client.post("/api/recurring", json=tmpl(world, next_date="2027-02-28", anchor_day=v))
        assert r.status_code == 422, v
