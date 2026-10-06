"""Fixes from the 2026-10 pass: category type changes, clearing a typed balance, account opening months, settings."""
from __future__ import annotations
from .conftest import txn


def test_category_type_change_refused_while_entries_do_not_fit(client, world):
    client.post("/api/transactions", json=txn(world))  # spending From the card
    r = client.put(f"/api/categories/{world['food']}", json={"name": "Groceries", "type": "Money in"})
    assert r.status_code == 409
    assert "1 entry in Groceries" in r.json()["detail"]["errors"][0]
    cats = {c["id"]: c for c in client.get("/api/bootstrap").json()["categories"]}
    assert cats[world["food"]]["type"] == "Spending"


def test_category_type_change_allowed_when_entries_fit_or_none(client, world):
    # Unused: free to change.
    assert client.put(f"/api/categories/{world['gas']}", json={"name": "Gas", "type": "Saving"}).status_code == 200
    # Saving -> Spending: entries with only a From fit both.
    client.post("/api/transactions", json=txn(world, "save"))
    assert client.put(f"/api/categories/{world['roth']}", json={"name": "Roth IRA", "type": "Spending"}).status_code == 200


def test_category_type_change_checks_recurring_templates(client, world):
    client.post("/api/recurring", json={"label": "Rent", "category_id": world["gas"], "from_account_id": world["chk"],
                                        "amount": 900, "freq": "monthly", "next_date": "2099-01-01"})
    r = client.put(f"/api/categories/{world['gas']}", json={"name": "Gas", "type": "Money in"})
    assert r.status_code == 409 and "1 recurring" in r.json()["detail"]["errors"][0]


def test_typed_balance_can_be_cleared(client, world):
    ym = "2026-09"
    client.post("/api/transactions", json=txn(world))  # makes sure the month exists
    assert client.post(f"/api/month-end/{ym}/typed", json={str(world["loan"]): 9000}).status_code == 200
    assert client.get(f"/api/month-end/{ym}").json()["loans"][str(world["loan"])]["typed"] == 900000
    # "" leaves it alone, null takes it out.
    client.post(f"/api/month-end/{ym}/typed", json={str(world["loan"]): ""})
    assert client.get(f"/api/month-end/{ym}").json()["loans"][str(world["loan"])]["typed"] == 900000
    client.post(f"/api/month-end/{ym}/typed", json={str(world["loan"]): None})
    loan = client.get(f"/api/month-end/{ym}").json()["loans"][str(world["loan"])]
    assert loan["typed"] is None and loan["balance"] != 900000


def test_switching_a_loan_to_cash_drops_its_opening_month(client, world):
    client.put(f"/api/accounts/{world['loan']}", json={"name": "Loan", "kind": "loan", "opened": "2026-10"})
    r = client.put(f"/api/accounts/{world['loan']}", json={"name": "Loan", "kind": "cash"})  # no "opened" sent
    assert r.status_code == 200 and r.json()["opened"] is None


def test_emergency_fund_months_stay_in_range(client):
    assert client.put("/api/settings", json={"ef_months": 0}).status_code == 422
    assert client.put("/api/settings", json={"ef_months": 25}).status_code == 422
    assert client.put("/api/settings", json={"ef_months": 3}).json()["ef_months"] == "3"
