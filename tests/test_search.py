"""Search shortcuts in Activity (app/search.py)."""
from __future__ import annotations
from datetime import date
from app.search import parse
from .conftest import txn


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
