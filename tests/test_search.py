"""Search shortcuts in Activity (app/search.py)."""
from __future__ import annotations
from datetime import date
from app.search import parse
from .conftest import freeze, txn


def test_parse_pulls_out_amounts_months_and_tags():
    q = parse("Coffee >5 aug #Trip", date(2026, 10, 6))
    assert (q.text, q.min, q.max, q.tags) == ("coffee", 501, None, ["trip"])
    assert (q.first, q.last) == (date(2026, 8, 1), date(2026, 8, 31))
    assert parse("<=$1,200.50", date(2026, 10, 6)).max == 120050
    assert parse(">=20", date(2026, 10, 6)).min == 2000
    # Without a year, the latest such month up to now; with one, that year.
    assert parse("december", date(2026, 10, 6)).first == date(2025, 12, 1)
    assert parse("oct", date(2026, 10, 6)).first == date(2026, 10, 1)
    assert parse("feb 2027", date(2026, 10, 6)).last == date(2027, 2, 28)
    # Plain words and numbers are left as text.
    assert parse("may's cafe 12.50 #", date(2026, 10, 6)).text == "may's cafe 12.50 #"


def test_transactions_route_uses_the_shortcuts(client, world):
    client.post("/api/transactions", json=txn(world, what="Corner cafe", amount=4.5, date="2026-08-03", tags=["work"]))
    client.post("/api/transactions", json=txn(world, what="Corner cafe", amount=18, date="2026-08-20"))
    client.post("/api/transactions", json=txn(world, what="Corner cafe", amount=30, date="2026-09-02", tags=["work"]))
    get = lambda q: [t["amount"] for t in client.get("/api/transactions", params={"q": q, "sort": "amount"}).json()["items"]]
    assert get("cafe >5") == [3000, 1800]
    assert get("cafe aug 2026") == [1800, 450]
    assert get("#work") == [3000, 450]
    assert get("cafe <=18 #work") == [450]
    assert get("cafe") == [3000, 1800, 450]


def test_parse_takes_days_weeks_and_months_by_name():
    today = date(2026, 11, 18)  # a Wednesday
    span = lambda q: (parse(q, today).first, parse(q, today).last)
    assert span("today") == (today, today)
    assert span("yesterday") == (date(2026, 11, 17),) * 2
    assert span("this week") == (date(2026, 11, 15), date(2026, 11, 21))  # Sunday to Saturday
    assert span("last week") == (date(2026, 11, 8), date(2026, 11, 14))
    assert span("this month") == (date(2026, 11, 1), date(2026, 11, 30))
    assert span("last month") == (date(2026, 10, 1), date(2026, 10, 31))
    assert parse("dining last month", today).text == "dining"
    assert parse("last call", today).text == "last call"  # not a shortcut on its own


def test_this_week_on_a_sunday_is_the_past_seven_days():
    sunday = date(2026, 11, 22)
    span = lambda q, d: (parse(q, d).first, parse(q, d).last)
    assert span("this week", sunday) == (date(2026, 11, 16), sunday)
    assert span("last week", sunday) == (date(2026, 11, 15), date(2026, 11, 21))  # still Sunday to Saturday
    assert span("this week", date(2026, 11, 23)) == (date(2026, 11, 22), date(2026, 11, 28))  # Monday: from Sunday


def test_search_ignores_punctuation_and_matches_amounts_by_dollars(client, world):
    for what, amount in (("Trader Joe's", 59.01), ("Chipotle", 8.30), ("Chipotle", 30.12), ("Shell", 9.01),
                         ("Kiosk", 20.65), ("Diner", 65), ("Big rent", 650.50)):
        client.post("/api/transactions", json=txn(world, what=what, amount=amount))
    get = lambda q: client.get("/api/transactions", params={"q": q, "sort": "amount", "dir": "asc"}).json()
    names = lambda q: [t["what"] for t in get(q)["items"]]
    assert names("trader joes") == ["Trader Joe's"]
    assert names("joe's") == ["Trader Joe's"]
    assert names("9.01") == ["Shell"]  # not $59.01
    assert names("65") == ["Diner", "Big rent"]  # not $20.65
    assert names("chipotle 30") == ["Chipotle"]  # $30.12, not $8.30
    assert names("$650.50") == ["Big rent"]
    # The very amount first, then the rest, each part in the list's sort.
    r = get("6")
    assert [t["amount"] for t in r["items"]] == [6500, 65050] and r["exact"] == 0
    client.post("/api/transactions", json=txn(world, what="Six", amount=6))
    r = get("6")
    assert [t["amount"] for t in r["items"]] == [600, 6500, 65050] and r["exact"] == 1
    assert get("diner")["exact"] == 0


def test_search_shortcut_for_last_month(client, world, monkeypatch):
    freeze(monkeypatch, date(2026, 11, 18))
    client.put("/api/settings", json={"start_month": "2026-09-01"})
    client.post("/api/transactions", json=txn(world, what="Cafe", date="2026-10-12"))
    client.post("/api/transactions", json=txn(world, what="Cafe", date="2026-11-02"))
    dates = lambda q: [t["date"] for t in client.get("/api/transactions", params={"q": q}).json()["items"]]
    assert dates("groceries last month") == ["2026-10-12"]
    assert dates("cafe this month") == ["2026-11-02"]


def test_search_exact_means_to_the_cent_and_punctuation_alone_matches_as_typed(client, world):
    for what, amount in (("A&W", 6.99), ("Six", 6), ("Sixty", 65)):
        client.post("/api/transactions", json=txn(world, what=what, amount=amount))
    get = lambda q: client.get("/api/transactions", params={"q": q, "sort": "amount", "dir": "asc"}).json()
    names = lambda q: [t["what"] for t in get(q)["items"]]
    # "6" finds $6.00, $6.99 and $65, but only $6.00 is the exact amount.
    r = get("6")
    assert [t["what"] for t in r["items"]] == ["Six", "A&W", "Sixty"] and r["exact"] == 1
    assert get("5.")["total"] == 0 and names("6.") == names("6")  # a trailing point is the number still being typed
    # Punctuation on its own matches where it's written, not every entry.
    assert names("&") == ["A&W"]
    assert names("$") == [] and names("...") == [] and names("-") == []
