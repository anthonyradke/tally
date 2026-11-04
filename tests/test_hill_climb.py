"""Fixes from the 2026-11 pass: posted-only month totals, search words, bulk Undo, tags, values the API refused."""
from __future__ import annotations
from datetime import date
from .conftest import freeze, txn


def test_month_totals_count_only_what_has_happened(client, world, monkeypatch):
    freeze(monkeypatch, date(2026, 11, 4))
    client.put("/api/settings", json={"start_month": "2026-11-01"})
    for b in (txn(world, "in", date="2026-11-01", amount=3000), txn(world, date="2026-11-02", amount=100),
              txn(world, date="2026-11-20", amount=50), txn(world, "save", date="2026-11-03", amount=500)):
        assert client.post("/api/transactions", json=b).status_code == 201
    nov = next(m for m in client.get("/api/bootstrap").json()["months"] if m["month"] == "2026-11-01")
    assert nov["spent"] == 100_00  # the bill on the 20th joins on its day
    assert nov["left_over"] == 3000_00 - 100_00  # money in less spending
    assert nov["balances"][str(world["card"])] == 100_00


def test_search_matches_every_word_anywhere(client, world):
    client.post("/api/transactions", json=txn(world, what="Trader Joe's", amount=42))
    client.post("/api/transactions", json=txn(world, what="Refund", amount=-5))
    client.post("/api/transactions", json=txn(world, what="Corner store", amount=5))
    q = lambda s: [t["what"] for t in client.get("/api/transactions", params={"q": s}).json()["items"]]
    assert q("trader groceries") == ["Trader Joe's"]
    assert q("joe card") == ["Trader Joe's"]
    assert q("trader gas") == []
    assert q("-5") == ["Refund"]


def test_bulk_recategorize_and_tag_can_be_undone(client, world):
    a = client.post("/api/transactions", json=txn(world, tags=["trip"])).json()
    b = client.post("/api/transactions", json=txn(world, category_id=world["gas"])).json()
    r = client.post("/api/transactions/bulk", json={"ids": [a["id"], b["id"]], "action": "recategorize", "category_id": world["gas"]}).json()
    assert r["count"] == 2 and {x["id"]: x["category_id"] for x in r["before"]} == {a["id"]: world["food"], b["id"]: world["gas"]}
    assert client.post("/api/transactions/bulk", json={"action": "revert", "rows": r["before"]}).status_code == 200
    assert client.get(f"/api/transactions/{a['id']}").json()["category_id"] == world["food"]
    r = client.post("/api/transactions/bulk", json={"ids": [a["id"], b["id"]], "action": "tag", "tags": ["trip, gift", "#Work"]}).json()
    assert client.get(f"/api/transactions/{b['id']}").json()["tags"] == ["gift", "trip", "work"]  # no "trip," with a comma
    client.post("/api/transactions/bulk", json={"action": "revert", "rows": r["before"]})
    assert client.get(f"/api/transactions/{a['id']}").json()["tags"] == ["trip"]  # its own tag stays
    assert client.get(f"/api/transactions/{b['id']}").json()["tags"] == []


def test_bulk_counts_rows_that_exist(client, world):
    a = client.post("/api/transactions", json=txn(world)).json()
    r = client.post("/api/transactions/bulk", json={"ids": [a["id"], 99999], "action": "delete"}).json()
    assert r["count"] == 1
    assert client.post("/api/transactions/bulk", json={"ids": [99999], "action": "tag", "tags": ["x"]}).status_code == 404


def test_tags_split_on_commas_when_saving_an_entry(client, world):
    t = client.post("/api/transactions", json=txn(world, tags=["trip,", "gift"])).json()
    assert t["tags"] == ["gift", "trip"]


def test_account_kind_cannot_change_while_used(client, world):
    client.post("/api/transactions", json=txn(world, "in"))
    r = client.put(f"/api/accounts/{world['chk']}", json={"name": "Checking", "kind": "card"})
    assert r.status_code == 409 and "1 entry" in r.json()["detail"]["errors"][0]
    # Unused: free to change. A rename alone is fine too.
    assert client.put(f"/api/accounts/{world['card']}", json={"name": "Card", "kind": "cash"}).status_code == 200
    assert client.put(f"/api/accounts/{world['chk']}", json={"name": "Main", "kind": "cash"}).status_code == 200


def test_values_that_are_refused(client, world):
    put = lambda url, b: client.put(url, json=b).status_code
    post = lambda url, b: client.post(url, json=b).status_code
    assert post("/api/accounts", {"name": "Huge", "kind": "cash", "apy": 500}) == 422
    assert post("/api/accounts", {"name": "Neg", "kind": "cash", "apy": -1}) == 422
    assert post("/api/accounts", {"name": "checking", "kind": "cash"}) == 409  # differs only in case
    assert put(f"/api/accounts/{world['sav']}", {"name": "CHECKING", "kind": "cash"}) == 409
    assert post("/api/categories", {"name": "groceries", "type": "Spending"}) == 409
    assert put(f"/api/categories/{world['food']}", {"name": "Groceries", "type": "Spending"}) == 200  # its own name
    assert put(f"/api/budgets/{world['food']}", {"amount": -50}) == 422
    assert put(f"/api/budgets/{world['pay']}", {"amount": 50}) == 422  # not spending
    assert put("/api/settings", {"roth_limit": -1}) == 422
    # A budget left in the body after a type change is dropped, not stored on an income category.
    r = client.put(f"/api/categories/{world['gas']}", json={"name": "Gas", "type": "Saving", "budget": 80}).json()
    assert r["budget"] is None


def test_interest_is_logged_once_per_month(client, world, monkeypatch):
    freeze(monkeypatch, date(2026, 11, 4))
    client.put("/api/settings", json={"start_month": "2026-10-01", "interest_category": world["interest"]})
    for _ in range(2):
        assert client.post("/api/month-end/2026-10/interest", json={str(world["sav"]): 12.5}).status_code == 200
    got = client.get("/api/transactions", params={"category": world["interest"]}).json()
    assert got["total"] == 1


def test_interest_step_can_be_switched_off(client, world, monkeypatch):
    freeze(monkeypatch, date(2026, 11, 4))
    client.put("/api/settings", json={"start_month": "2026-10-01", "interest_category": ""})
    assert client.get("/api/month-end/2026-10").json()["interest"] == {}
