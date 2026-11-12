"""Regression tests for the 2026-11-11 review: inputs that broke every screen or returned 500, rules that restores and
month end skipped, and Settings links left pointing at deleted rows. All data is made up."""
from __future__ import annotations
from datetime import date
from .conftest import freeze, txn

TODAY = date(2026, 9, 24)


def test_only_json_bodies_are_read(client, world):
    """A web page can send text/plain to any address without a preflight: it must not count as JSON."""
    client.post("/api/transactions", json=txn(world))
    r = client.post("/api/transactions/bulk", content='{"ids":[1],"action":"delete"}',
                    headers={"content-type": "text/plain;charset=UTF-8", "origin": "https://example.com"})
    assert r.status_code == 415
    assert client.get("/api/transactions").json()["total"] == 1
    assert client.post("/api/transactions", json=txn(world)).status_code == 201


def test_month_end_months_must_be_in_the_ledger(client, world):
    assert client.post("/api/month-end/9999-12/typed", json={str(world["ira"]): 100}).status_code == 404
    assert client.post("/api/month-end/2099-01/interest", json={str(world["sav"]): 1}).status_code == 404
    assert client.post("/api/month-end/1999-01/interest", json={str(world["sav"]): 1}).status_code == 404
    assert client.get("/api/month-end/0000-05").status_code == 422
    assert client.get("/api/bootstrap").status_code == 200
    assert client.post("/api/month-end/2026-08/typed", json={str(world["ira"]): 100}).status_code == 200


def test_edge_inputs_are_4xx_not_500(client, world):
    assert client.get("/api/transactions?q=>" + "9" * 30).status_code == 200
    assert client.get("/api/transactions/99999999999999999999").status_code in (404, 422)
    assert client.get("/api/reconciliations?limit=99999999999999999999").status_code == 200  # clamped
    r = client.post("/api/transactions/bulk", json={"ids": list(range(40_000)), "action": "delete"})
    assert r.status_code == 422
    assert client.put("/api/settings", json={"start_month": "1000-01-01"}).status_code == 422
    assert client.post("/api/transactions", json=txn(world, tags=["x" * 200])).status_code == 422
    assert client.get("/api/bootstrap").status_code == 200


def test_restore_keeps_the_from_to_rules(client, world):
    row = client.post("/api/transactions", json=txn(world)).json()
    gone = client.delete(f"/api/transactions/{row['id']}").json()
    # Unused now, so the category may change type; the deleted Spending row no longer fits it.
    assert client.put(f"/api/categories/{world['food']}", json={"name": "Groceries", "type": "Money in"}).status_code == 200
    r = client.post("/api/transactions/restore", json={"rows": [{**gone, "amount": gone["amount"] / 100}]})
    assert r.status_code == 422
    zero = {**gone, "category_id": world["gas"], "amount": 0}
    assert client.post("/api/transactions/restore", json={"rows": [zero]}).status_code == 422


def test_restoring_a_template_ignores_a_bad_anchor(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    t = client.post("/api/recurring", json={"label": "Rent", "category_id": world["food"], "from_account_id": world["chk"],
                                            "amount": 100, "freq": "monthly", "next_date": "2026-10-05"}).json()
    gone = client.delete(f"/api/recurring/{t['id']}").json()["template"]
    r = client.post("/api/recurring/restore", json={"template": {**gone, "anchor_day": -3}})
    assert r.status_code == 201 and r.json()["anchor_day"] == 5
    assert client.get("/api/bootstrap").status_code == 200


def test_weekly_to_monthly_aims_for_the_day_it_now_starts(client, world, monkeypatch):
    freeze(monkeypatch, TODAY)
    body = {"label": "Gym", "category_id": world["food"], "from_account_id": world["chk"], "amount": 30,
            "freq": "weekly", "next_date": "2026-09-01"}
    t = client.post("/api/recurring", json=body).json()
    client.get("/api/bootstrap")
    nxt = client.get("/api/admin").json()["recurring"][0]["next_date"]
    t2 = client.put(f"/api/recurring/{t['id']}", json={**body, "freq": "monthly", "next_date": nxt}).json()
    client.get("/api/bootstrap")
    ahead = [x["date"] for x in client.get("/api/transactions?q=Gym&sort=date&dir=asc&start=2026-09-25").json()["items"]]
    assert t2["anchor_day"] == date.fromisoformat(ahead[0]).day
    assert all(date.fromisoformat(d).day == t2["anchor_day"] for d in ahead)
    assert len(ahead) == len(set(d[:7] for d in ahead))  # one a month, never two days apart


def test_interest_category_must_be_money_in(client, world):
    assert client.put("/api/settings", json={"interest_category": world["food"]}).status_code == 422
    assert client.put("/api/settings", json={"roth_category": world["pay"]}).status_code == 422
    assert client.put("/api/settings", json={"roth_category": world["roth"]}).status_code == 200


def test_deleting_a_category_switches_its_setting_off(client, world):
    c = client.post("/api/categories", json={"name": "Interest", "type": "Money in"}).json()["id"]
    client.put("/api/settings", json={"interest_category": c})
    assert client.delete(f"/api/categories/{c}").status_code == 204
    assert client.get("/api/admin").json()["settings"]["interest_category"] == ""
    new = client.post("/api/categories", json={"name": "Coffee", "type": "Spending"}).json()["id"]
    assert client.get("/api/admin").json()["settings"]["interest_category"] != str(new)


def test_an_account_with_only_reconciliations_can_be_deleted(client, world):
    a = client.post("/api/accounts", json={"name": "Old", "kind": "cash"}).json()["id"]
    client.post(f"/api/reconcile/{a}", json={"actual": 0, "save": True})
    assert client.delete(f"/api/accounts/{a}").status_code == 204
    client.post("/api/transactions", json=txn(world))
    r = client.delete(f"/api/accounts/{world['card']}")
    assert r.status_code == 409 and "entries" in r.json()["detail"]["errors"][0]


def test_month_end_leaves_out_investments_not_yet_opened(client, world):
    later = client.post("/api/accounts", json={"name": "New IRA", "kind": "investment", "opened": "2026-12"}).json()["id"]
    typed = client.get("/api/month-end/2026-09").json()["typed"]
    assert str(later) not in typed and str(world["ira"]) in typed


def test_receipts_are_served_with_nosniff(client, world):
    tid = client.post("/api/transactions", json=txn(world)).json()["id"]
    up = client.post(f"/api/transactions/{tid}/receipt", files={"file": ("r.png", b"\x89PNG....", "image/png")}).json()
    r = client.get(f"/api/receipts/{up['receipt']}")
    assert r.headers["x-content-type-options"] == "nosniff"


def test_exports_escape_formulas(client, world):
    client.post("/api/transactions", json=txn(world, what='=HYPERLINK("http://x","y")'))
    text = client.get("/export/log.csv").text
    assert text.startswith("﻿") and "'=HYPERLINK" in text
