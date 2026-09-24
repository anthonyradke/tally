"""Every route: the happy path and its status code, unknown ids, and bad input. Bad input must be a 4xx with a
message the app can show, never a 500 (the app files a 500 under "Request failed" with no reason)."""
from __future__ import annotations
import pytest
from .conftest import txn


def ok(r, status=200):
    assert r.status_code == status, (r.status_code, r.text)
    return r.json() if r.content else None


# ---------- happy paths ----------

def test_bootstrap_shape(client, world):
    b = ok(client.get("/api/bootstrap"))
    assert set(b) >= {"today", "start", "accounts", "categories", "favorites", "budgets", "recurring", "saved_views",
                      "settings", "months", "ef", "roth"}
    assert [a["name"] for a in b["accounts"]] == ["Checking", "Savings", "Card", "IRA", "Loan"]
    assert all(isinstance(a["active"], bool) and isinstance(a["ef"], bool) for a in b["accounts"])


def test_transaction_crud(client, world):
    t = ok(client.post("/api/transactions", json=txn(world, what="  Café ✓  ", note=" hi ", tags="#A b")), 201)
    assert t["what"] == "Café ✓" and t["note"] == "hi" and t["tags"] == ["a", "b"] and t["amount"] == 1234
    u = ok(client.put(f"/api/transactions/{t['id']}", json=txn(world, amount="99.99", what="Market")))
    assert u["amount"] == 9999 and u["id"] == t["id"]
    gone = ok(client.delete(f"/api/transactions/{t['id']}"))
    assert gone["id"] == t["id"] and gone["amount"] == 9999
    assert ok(client.get("/api/transactions"))["total"] == 0
    back = ok(client.post("/api/transactions/restore", json={"rows": [{**gone, "amount": gone["amount"] / 100}]}), 201)
    assert back[0]["id"] == t["id"] and back[0]["amount"] == 9999
    assert client.post("/api/transactions/restore",
                       json={"rows": [{**gone, "amount": 99.99}]}).status_code == 409  # already back


def test_every_type_saves(client, world):
    for kind in ("spend", "in", "move", "save", "loan"):
        ok(client.post("/api/transactions", json=txn(world, kind)), 201)
    assert ok(client.get("/api/transactions"))["total"] == 5


def test_bulk_actions(client, world):
    ids = [ok(client.post("/api/transactions", json=txn(world)), 201)["id"] for _ in range(3)]
    assert ok(client.post("/api/transactions/bulk", json={"ids": ids, "action": "tag", "tags": ["Trip", "#x"]}))["count"] == 3
    assert ok(client.get("/api/transactions?tag=trip"))["total"] == 3
    ok(client.post("/api/transactions/bulk", json={"ids": ids[:1], "action": "recategorize", "category_id": world["gas"]}))
    assert ok(client.get(f"/api/transactions?category={world['gas']}"))["total"] == 1
    # moving spending into an income category would flip its meaning
    r = client.post("/api/transactions/bulk", json={"ids": ids, "action": "recategorize", "category_id": world["pay"]})
    assert r.status_code == 422
    assert client.post("/api/transactions/bulk", json={"ids": ids, "action": "nope"}).status_code == 422
    assert client.post("/api/transactions/bulk", json={"ids": [], "action": "delete"}).status_code == 422
    d = ok(client.post("/api/transactions/bulk", json={"ids": ids, "action": "delete"}))
    assert len(d["deleted"]) == 3


def test_filters(client, world):
    ok(client.post("/api/transactions", json=txn(world, date="2026-08-31", amount=5, what="Early")), 201)
    ok(client.post("/api/transactions", json=txn(world, date="2026-09-01", amount=50, what="Late", note="receipt")), 201)
    ok(client.post("/api/transactions", json=txn(world, "in", date="2026-09-02", amount=500)), 201)
    q = lambda s: ok(client.get(f"/api/transactions?{s}"))
    assert q("start=2026-09-01")["total"] == 2
    assert q("end=2026-08-31")["total"] == 1
    assert q("type=Money in")["total"] == 1
    assert q(f"account={world['chk']}")["total"] == 1
    assert q("amount_min=10&amount_max=100")["total"] == 1
    assert q("q=RECEIPT")["total"] == 1
    assert q("q=$50.00")["total"] == 1
    assert q("q=checking")["total"] == 1  # account names are searched too
    page = q("sort=amount&dir=asc&limit=2&offset=1")
    assert [x["amount"] for x in page["items"]] == [5000, 50000] and page["total"] == 3
    assert page["by_type"] == {"Spending": 5500, "Money in": 50000} and page["sum"] == 55500


def test_split_and_group(client, world):
    lines = [txn(world, amount=30), txn(world, category_id=world["gas"], amount=20)]
    rows = ok(client.post("/api/transactions/split", json={"lines": lines}), 201)
    g = rows[0]["split_group"]
    assert g and all(r["split_group"] == g for r in rows)
    assert ok(client.get(f"/api/transactions?group={g}"))["sum"] == 5000
    bad = [txn(world, amount=30), txn(world, "in", amount=20)]
    bad[1]["from_id"] = world["card"]
    assert client.post("/api/transactions/split", json={"lines": bad}).status_code == 422
    assert ok(client.get("/api/transactions"))["total"] == 2  # nothing written by the refused split


def test_reconcile_and_history(client, world):
    ok(client.post("/api/transactions", json=txn(world, "in", date="2026-09-01", amount=100)), 201)
    d = ok(client.post(f"/api/reconcile/{world['chk']}", json={"actual": 1100}))
    assert d["expected"] == 110000 and d["gap"] == 0 and d["saved"] is False
    d = ok(client.post(f"/api/reconcile/{world['chk']}", json={"actual": 1000, "save": True}))
    assert d["gap"] == -10000 and [x["amount"] for x in d["single"]] == [10000]
    hist = ok(client.get("/api/reconciliations"))
    assert len(hist) == 1 and hist[0]["actual"] == 100000 and hist[0]["expected"] == 110000


def test_month_end(client, world):
    ok(client.put("/api/settings", json={"interest_category": world["interest"]}))
    me = ok(client.get("/api/month-end/2026-09"))
    assert me["typed"] == {str(world["ira"]): None} and not me["typed_done"]
    assert me["interest"][str(world["sav"])]["proposed"] == round(500000 * 0.04 / 12)
    ok(client.post("/api/month-end/2026-09/typed", json={str(world["ira"]): "2100.50"}))
    ok(client.post("/api/month-end/2026-09/interest", json={str(world["sav"]): 16.67}))
    me = ok(client.get("/api/month-end/2026-09"))
    assert me["typed"][str(world["ira"])] == 210050 and me["typed_done"] and me["interest_done"]
    logged = me["interest"][str(world["sav"])]["logged"][0]
    assert logged["date"] == "2026-09-30" and logged["amount"] == 1667 and logged["what"] == "Savings interest"


def test_admin_crud(client, world):
    a = ok(client.get("/api/admin"))
    assert len(a["accounts"]) == 5 and "settings" in a
    acc = ok(client.put(f"/api/accounts/{world['chk']}", json={"name": "Everyday", "kind": "cash", "start_balance": 1000}))
    assert acc["name"] == "Everyday"
    cat = ok(client.put(f"/api/categories/{world['gas']}", json={"name": "Fuel", "type": "Spending", "budget": 80}))
    assert cat["budget"] == 8000
    fav = ok(client.post("/api/favorites", json={"label": "Coffee", "category_id": world["food"],
                                                 "from_account_id": world["card"], "amount": 4.5}), 201)
    assert fav["amount"] == 450
    fav = ok(client.put(f"/api/favorites/{fav['id']}", json={"label": "Tea", "category_id": world["food"]}))
    assert fav["label"] == "Tea" and fav["amount"] is None
    ok(client.put("/api/favorites/order", json={"ids": [fav["id"]]}))
    view = ok(client.post("/api/saved-views", json={"name": "Trips", "query": "tag=trip"}), 201)
    ok(client.put(f"/api/saved-views/{view['id']}", json={"name": "Travel", "query": "tag=trip"}))
    ok(client.put("/api/saved-views/order", json={"ids": [view["id"]]}))
    assert ok(client.get("/api/admin"))["saved_views"][0]["name"] == "Travel"
    for path in (f"/api/favorites/{fav['id']}", f"/api/saved-views/{view['id']}"):
        assert client.delete(path).status_code == 204
    # an account with entries can't be deleted, only hidden
    ok(client.post("/api/transactions", json=txn(world)), 201)
    r = client.delete(f"/api/accounts/{world['card']}")
    assert r.status_code == 409 and "Active" in r.json()["detail"]["errors"][0]
    assert client.delete(f"/api/categories/{world['food']}").status_code == 409


def test_settings(client, world):
    s = ok(client.put("/api/settings", json={"home_layout": {"order": ["recent"]}, "theme": "dark",
                                             "roth_category": world["roth"], "interest_category": ""}))
    assert s["home_layout"] == '{"order": ["recent"]}' and s["interest_category"] == ""
    assert client.put("/api/settings", json={"roth_category": 99999}).status_code == 422


def test_backups_empty_and_latest(client, tmp_path):
    assert ok(client.get("/api/backups"))["latest"] is None
    folder = tmp_path / "backups"
    folder.mkdir()
    for name in ("tally-2026-09-01.db", "tally-2026-09-02.db", "tally-pre-change.db"):
        (folder / name).write_bytes(b"x")
    b = ok(client.get("/api/backups"))
    assert b["latest"]["name"] == "tally-2026-09-02.db" and b["count"] == 2


def test_web_app_is_gone(client):
    assert client.get("/").status_code == 404
    assert client.get("/index.html").status_code == 404


# ---------- unknown ids ----------

UNKNOWN = [
    ("PUT", "/api/transactions/999999", "txn"),
    ("DELETE", "/api/transactions/999999", None),
    ("POST", "/api/reconcile/999999", {"actual": 1}),
    ("PUT", "/api/accounts/999999", {"name": "X", "kind": "cash"}),
    ("PUT", "/api/categories/999999", {"name": "X", "type": "Spending"}),
    ("PUT", "/api/favorites/999999", {"label": "X", "category_id": 1}),
    ("PUT", "/api/saved-views/999999", {"name": "X"}),
    ("PUT", "/api/recurring/999999", "recurring"),
    ("PUT", "/api/budgets/999999", {"amount": 5}),
    ("GET", "/api/receipts/999999-abcdef12.png", None),
]


@pytest.mark.parametrize("method,path,body", UNKNOWN)
def test_unknown_ids_are_404(client, world, method, path, body):
    if body == "txn":
        body = txn(world)
    elif body == "recurring":
        body = {"label": "R", "category_id": world["food"], "from_account_id": world["card"], "amount": 5,
                "freq": "monthly", "next_date": "2026-09-01"}
    r = client.request(method, path, json=body)
    assert r.status_code == 404, r.text


def test_receipt_upload_unknown_txn_is_404(client):
    r = client.post("/api/transactions/999999/receipt", files={"file": ("r.png", b"\x89PNG", "image/png")})
    assert r.status_code == 404


def test_month_end_interest_unknown_account_is_404(client, world):
    ok(client.put("/api/settings", json={"interest_category": world["interest"]}))
    assert client.post("/api/month-end/2026-09/interest", json={"999999": 5}).status_code == 404
    assert ok(client.get("/api/transactions"))["total"] == 0  # the refused request wrote nothing


# ---------- bad input ----------

def test_transaction_rules(client, world):
    errs = lambda body: client.post("/api/transactions", json=body).json()["detail"]["errors"]
    assert "Amount can't be zero." in errs(txn(world, amount=0))
    assert any("From is required" in e for e in errs(txn(world, from_id=None)))
    assert any("To must be blank" in e for e in errs(txn(world, to_id=world["chk"])))
    assert any("same account" in e for e in errs(txn(world, "move", to_id=world["chk"])))
    assert "Unknown account." in errs(txn(world, from_id=424242))
    assert errs(txn(world, category_id=424242)) == ["Pick a category."]
    assert any("Bad field" in e for e in errs(txn(world, date="2026-02-30")))
    assert any("Bad field" in e for e in errs({k: v for k, v in txn(world).items() if k != "date"}))


def test_negative_amounts_are_refunds(client, world):
    t = ok(client.post("/api/transactions", json=txn(world, amount=-12.5)), 201)
    assert t["amount"] == -1250


def test_unicode_and_long_text_round_trip(client, world):
    what = "Ünïcødé 🍕 " + "x" * 2000
    t = ok(client.post("/api/transactions", json=txn(world, what=what, note="日本語")), 201)
    assert t["what"] == what.strip() and t["note"] == "日本語"
    assert ok(client.get("/api/transactions?q=🍕"))["total"] == 1


# Bodies that aren't what the app sends. Each must be refused with a 4xx, not crash with a 500.
def _bad_bodies(w):
    good = txn(w)
    yield "POST", "/api/transactions", b"not json"
    yield "POST", "/api/transactions", []
    yield "POST", "/api/transactions", "x"
    yield "POST", "/api/transactions", {**good, "amount": "abc"}
    yield "POST", "/api/transactions", {**good, "amount": "NaN"}
    yield "POST", "/api/transactions", {**good, "amount": "Infinity"}
    yield "POST", "/api/transactions", {**good, "amount": 1e30}
    yield "POST", "/api/transactions", {**good, "amount": [1]}
    yield "POST", "/api/transactions", {**good, "what": 5}
    yield "POST", "/api/transactions", {**good, "note": ["x"]}
    yield "POST", "/api/transactions", {**good, "tags": 5}
    yield "PUT", "/api/transactions/1", {**good, "amount": "abc"}
    yield "POST", "/api/transactions/split", {"lines": "x"}
    yield "POST", "/api/transactions/split", {"lines": [good, {**good, "amount": "abc"}]}
    yield "POST", "/api/transactions/restore", {"rows": [{"date": "2026-09-01"}]}
    yield "POST", "/api/transactions/restore", {"rows": [{**good, "id": "abc"}]}
    yield "POST", "/api/transactions/bulk", {"ids": "abc", "action": "delete"}
    yield "POST", "/api/transactions/bulk", {"ids": ["x"], "action": "delete"}
    yield "POST", "/api/transactions/bulk", {"ids": [1], "action": "tag", "tags": None}
    yield "POST", "/api/transactions/bulk", {"ids": [1], "action": "recategorize", "category_id": "abc"}
    yield "POST", f"/api/reconcile/{w['chk']}", {"actual": "abc"}
    yield "POST", f"/api/reconcile/{w['chk']}", {"actual": 1e30}
    yield "POST", "/api/month-end/2026-09/typed", {str(w["ira"]): "abc"}
    yield "POST", "/api/month-end/2026-09/typed", {"abc": 5}
    yield "POST", "/api/month-end/2026-09/typed", {"424242": 5}
    yield "POST", "/api/month-end/2026-09/interest", {str(w["sav"]): "abc"}
    yield "POST", "/api/month-end/nope/typed", {}
    yield "POST", "/api/accounts", {"name": "A", "kind": "cash", "start_balance": "abc"}
    yield "POST", "/api/accounts", {"name": "A", "kind": "cash", "apy": "abc"}
    yield "POST", "/api/accounts", {"name": "A", "kind": "cash", "sort": "abc"}
    yield "POST", "/api/accounts", {"name": "A", "kind": "cash", "active": "abc"}
    yield "POST", "/api/accounts", {"name": 5, "kind": "cash"}
    yield "POST", "/api/accounts", {"name": "Checking", "kind": "cash"}  # duplicate name
    yield "PUT", f"/api/accounts/{w['card']}", {"name": "Checking", "kind": "card"}  # rename onto another
    yield "POST", "/api/categories", {"name": "Groceries", "type": "Spending"}  # duplicate name
    yield "POST", "/api/categories", {"name": "C", "type": "Spending", "budget": "abc"}
    yield "POST", "/api/favorites", {"label": "F"}
    yield "POST", "/api/favorites", {"label": "F", "category_id": 424242}
    yield "POST", "/api/favorites", {"label": "F", "category_id": w["food"], "from_account_id": 424242}
    yield "POST", "/api/favorites", {"label": "F", "category_id": w["food"], "amount": "abc"}
    yield "POST", "/api/saved-views", {"name": "V", "sort": "abc"}
    yield "POST", "/api/recurring", {"label": "R", "category_id": w["food"], "from_account_id": w["card"],
                                     "amount": "abc", "freq": "monthly", "next_date": "2026-09-01"}
    yield "PUT", f"/api/budgets/{w['food']}", {"amount": "abc"}
    yield "PUT", f"/api/budgets/{w['food']}", {"amount": 5, "month": "September"}
    yield "PUT", "/api/accounts/order", {"ids": "abc"}
    yield "PUT", "/api/accounts/order", {"ids": ["abc"]}
    yield "PUT", "/api/settings", {"ef_months": "abc"}
    yield "PUT", "/api/settings", {"roth_limit": "abc"}
    yield "PUT", "/api/settings", {"roth_category": "abc"}
    yield "PUT", "/api/settings", []


@pytest.mark.xfail(strict=True, reason="bug: malformed values crash with a 500")
def test_bad_input_is_4xx(client, world):
    ok(client.post("/api/transactions", json=txn(world)), 201)
    crashed = []
    for method, path, body in _bad_bodies(world):
        kw = {"content": body, "headers": {"content-type": "application/json"}} if isinstance(body, bytes) else {"json": body}
        r = client.request(method, path, **kw)
        if r.status_code >= 500 or r.status_code < 400:
            crashed.append(f"{method} {path} {body!r:.80} -> {r.status_code}")
        elif r.status_code != 404:
            detail = r.json().get("detail")
            assert isinstance(detail, dict) and detail.get("errors"), (path, body, r.text)
    assert not crashed, "\n".join(crashed)
    assert ok(client.get("/api/bootstrap"))  # and nothing above broke the database


BAD_DATE = pytest.mark.xfail(strict=True, reason="bug: a bad date filter is a 500")
BAD_QUERIES = [pytest.param("start=bad", marks=BAD_DATE), pytest.param("end=2026-13-01", marks=BAD_DATE),
               "amount_min=abc", "category=abc", "limit=abc"]


@pytest.mark.parametrize("qs", BAD_QUERIES)
def test_bad_list_queries_are_422(client, world, qs):
    client.post("/api/transactions", json=txn(world))  # the date filters only ran with rows to filter
    assert client.get(f"/api/transactions?{qs}").status_code == 422


@pytest.mark.xfail(strict=True, reason="bug: a malformed month is a 500")
@pytest.mark.parametrize("ym", ["bad", "2026-13", "2026-9"])
def test_bad_month_end_month_is_422(client, world, ym):
    assert client.get(f"/api/month-end/{ym}").status_code == 422


@pytest.mark.xfail(strict=True, reason="bug: a month outside the ledger is a 500")
@pytest.mark.parametrize("ym", ["1999-01", "2099-01"])
def test_month_end_outside_the_ledger_is_404(client, world, ym):
    assert client.get(f"/api/month-end/{ym}").status_code == 404


@pytest.mark.parametrize("value", ["", "abc", "2026-13-01", None, 5])
def test_a_bad_start_month_is_refused(client, world, value):
    """start_month feeds every balance. Storing garbage there used to break every screen until fixed by hand."""
    r = client.put("/api/settings", json={"start_month": value})
    assert r.status_code == 422
    assert client.get("/api/bootstrap").status_code == 200


def test_start_month_is_stored_as_the_first(client, world):
    s = ok(client.put("/api/settings", json={"start_month": "2026-07-15"}))
    assert s["start_month"] == "2026-07-01"


@pytest.mark.xfail(strict=True, reason="bug: no way to load one entry; the composer searches the newest 2000")
def test_get_one_transaction(client, world):
    t = ok(client.post("/api/transactions", json=txn(world, note="n", tags=["x"])), 201)
    assert ok(client.get(f"/api/transactions/{t['id']}")) == t
    assert client.get("/api/transactions/999999").status_code == 404
