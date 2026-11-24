"""Setting a new ledger up from the banks, Tally adding what it's sure of, balances held at the bank's, and logos.
All data is made up; nothing reaches Plaid or logo.dev."""
from __future__ import annotations
from datetime import date
import pytest
from app import bank, logos, plaid
from tests.conftest import freeze
from tests.test_bank import FakePlaid


def prow(tid, account, amount, day, raw, merchant=None, pfc=None, conf="LOW", site=None):
    return {"transaction_id": tid, "account_id": account, "amount": amount, "date": day, "authorized_date": day,
            "original_description": raw, "name": raw, "merchant_name": merchant, "merchant_entity_id": None,
            "pending": False, "pending_transaction_id": None, "website": site, "logo_url": None,
            "personal_finance_category": {"primary": None, "detailed": pfc, "confidence_level": conf}}


@pytest.fixture
def fake(monkeypatch):
    f = FakePlaid()
    monkeypatch.setenv("PLAID_CLIENT_ID", "id")
    monkeypatch.setenv("PLAID_SECRET", "secret")
    monkeypatch.setenv("PLAID_ENV", "sandbox")
    monkeypatch.setattr(plaid, "call", f)
    return f


@pytest.fixture
def fresh(client, fake, monkeypatch):
    """A new ledger with the test bank connected and two months of rows."""
    freeze(monkeypatch, date(2026, 9, 30))
    fake.push(added=[
        prow("gas", "acc-card", 40.00, "2026-08-05", "SHELL OIL 5544", "Shell", "TRANSPORTATION_GAS", "VERY_HIGH"),
        prow("pay", "acc-chk", -2000.00, "2026-09-01", "ACME PAYROLL", "Acme", "INCOME_WAGES", "HIGH"),
        prow("odd", "acc-card", 12.00, "2026-09-03", "SQ *THING 22"),
        prow("pmt-out", "acc-chk", 100.00, "2026-09-10", "PAYMENT TO CARD", None, "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"),
        prow("pmt-in", "acc-card", -100.00, "2026-09-11", "PAYMENT THANK YOU", None, "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"),
    ])
    assert client.post("/api/bank/sandbox/connect").status_code == 201
    return client


def test_setup_builds_the_ledger_from_the_banks(fresh):
    s = fresh.get("/api/setup").json()
    assert s["needed"] is True
    accts = s["items"][0]["accounts"]
    assert [(a["suggested"], a["kind"], a["include"]) for a in accts] == [("Test Checking", "cash", True),
                                                                        ("Test Card", "card", True)]
    r = fresh.post("/api/setup", json={"history": "all", "accounts": [{"id": a["id"], "include": True} for a in accts]})
    assert r.status_code == 200, r.text
    done = r.json()
    assert done["start"] == "2026-08-01"
    assert done["added"] == 3  # the gas, the paycheck, one side of the card payment
    assert done["waiting"] == 1  # the square charge nobody knows
    b = fresh.get("/api/bootstrap").json()
    assert len(b["categories"]) == len(bank.DEFAULT_CATEGORIES)
    names = {a["id"]: a["name"] for a in b["accounts"]}
    row = next(m for m in b["months"] if m["month"] == "2026-09-01")
    assert {names[int(k)]: v for k, v in row["balances"].items()} == {"Test Checking": 90000, "Test Card": 5000}
    txns = fresh.get("/api/transactions").json()["items"]
    assert sorted(t["what"] for t in txns) == ["Acme", "Credit Card Payment", "Shell"]
    assert fresh.post("/api/setup", json={"history": "all", "accounts": [{"id": accts[0]["id"]}]}).status_code == 409
    recent = fresh.get("/api/bank/recent").json()
    assert sorted(x["what"] for x in recent) == ["Acme", "Credit Card Payment", "Shell"]


def test_adding_the_rest_keeps_the_bank_balance(fresh, fake):
    accts = fresh.get("/api/setup").json()["items"][0]["accounts"]
    fresh.post("/api/setup", json={"history": "all", "accounts": [{"id": a["id"]} for a in accts]})
    odd = fresh.get("/api/bank/inbox").json()[0]
    other = next(c["id"] for c in fresh.get("/api/bootstrap").json()["categories"] if c["name"] == "Shopping")
    assert fresh.post(f"/api/bank/inbox/{odd['id']}/accept", json={"category_id": other}).status_code == 201
    b = fresh.get("/api/bootstrap").json()
    card = next(a["id"] for a in b["accounts"] if a["kind"] == "card")
    assert b["months"][-1]["balances"][str(card)] == 5000
    # A later sync brings a new charge Plaid is sure of: added by itself, balance follows the bank.
    fake.accounts[1]["balances"]["current"] = 75.0
    fake.push(added=[prow("more", "acc-card", 25.00, "2026-09-29", "SHELL OIL 5544", "Shell", "TRANSPORTATION_GAS",
                          "VERY_HIGH")])
    assert fresh.post("/api/bank/sync").json()["added"] == 1
    b = fresh.get("/api/bootstrap").json()
    assert b["months"][-1]["balances"][str(card)] == 7500


def test_this_month_only(fresh):
    accts = fresh.get("/api/setup").json()["items"][0]["accounts"]
    done = fresh.post("/api/setup", json={"history": "month", "accounts": [{"id": a["id"]} for a in accts]}).json()
    assert done["start"] == "2026-09-01"
    assert [b["raw"] for b in fresh.get("/api/bank/inbox").json()] == ["SQ *THING 22"]
    assert "Shell" not in [t["what"] for t in fresh.get("/api/transactions").json()["items"]]  # August's


def test_left_out_accounts_are_not_tracked(fresh):
    accts = fresh.get("/api/setup").json()["items"][0]["accounts"]
    fresh.post("/api/setup", json={"history": "all", "accounts": [{"id": accts[0]["id"], "name": "Everyday"},
                                                                  {"id": accts[1]["id"], "include": False}]})
    assert [a["name"] for a in fresh.get("/api/bootstrap").json()["accounts"]] == ["Everyday"]
    assert fresh.get("/api/bank").json()["ask"] == []


def test_domains_for_names():
    assert logos.domains_for("Costco (groceries)") == ["costco.com"]
    assert logos.domains_for("Venmo to Lex") == ["venmo.com"]
    assert logos.domains_for("Paycheck") == []
    assert logos.domains_for("Gas") == []
    assert logos.domains_for("Tesla Insurance") == ["teslainsurance.com", "tesla.com"]
    assert logos.domains_for("McDonald's") == ["mcdonalds.com"]
    assert logos.domains_for("Chick-fil-A") == ["chickfila.com"]
    assert logos.domains_for("Amex") == ["americanexpress.com"]
    assert logos.domains_for("First Platypus") == ["firstplatypus.com"]  # not first.com
    assert logos.domains_for("Chase CC payment") == ["chaseccpayment.com", "chase.com"]


PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 40


def test_logo_endpoint_caches_and_hides(client, monkeypatch):
    monkeypatch.setenv("LOGO_DEV_KEY", "pk_test")
    asked = []

    def get(url):
        asked.append(url)
        return PNG if "img.logo.dev/costco.com" in url else None
    monkeypatch.setattr(logos, "_get", get)
    r = client.get("/api/logo", params={"name": "Costco (groceries)"})
    assert r.status_code == 200 and r.content == PNG
    assert client.get("/api/logo", params={"name": "COSTCO"}).status_code == 200
    assert len(asked) == 1  # the second came from the cache
    assert client.get("/api/logo", params={"name": "Paycheck"}).status_code == 404
    assert client.get("/api/logo", params={"name": "Zzq Shop"}).status_code == 404
    n = len(asked)
    assert client.get("/api/logo", params={"name": "Zzq Shop"}).status_code == 404
    assert len(asked) == n  # a miss is remembered
    assert client.delete("/api/logo", params={"name": "Costco"}).status_code == 204
    assert client.get("/api/logo", params={"name": "Costco"}).status_code == 404
    assert client.post("/api/logo/show", params={"name": "Costco"}).status_code == 204
    assert client.get("/api/logo", params={"name": "Costco"}).status_code == 200


def test_deleting_an_auto_entry_keeps_it_out(fresh):
    accts = fresh.get("/api/setup").json()["items"][0]["accounts"]
    fresh.post("/api/setup", json={"history": "all", "accounts": [{"id": a["id"]} for a in accts]})
    shell = next(t for t in fresh.get("/api/transactions").json()["items"] if t["what"] == "Shell")
    assert fresh.delete(f"/api/transactions/{shell['id']}").status_code == 200
    fresh.post("/api/bank/sync")
    assert "Shell" not in [t["what"] for t in fresh.get("/api/transactions").json()["items"]]
    assert "SHELL OIL 5544" not in [b["raw"] for b in fresh.get("/api/bank/inbox").json()]


def test_history_arriving_later_comes_in(fresh, fake):
    """The bank's older rows arrive after setup: the ledger reaches back to them and adds the sure ones."""
    accts = fresh.get("/api/setup").json()["items"][0]["accounts"]
    fresh.post("/api/setup", json={"history": "all", "accounts": [{"id": a["id"]} for a in accts]})
    fake.push(added=[prow("old", "acc-card", 30.00, "2026-06-15", "SHELL OIL 5544", "Shell", "TRANSPORTATION_GAS", "VERY_HIGH"),
                     prow("odd2", "acc-card", 9.00, "2026-06-16", "SQ *ELSE 1")])
    assert fresh.post("/api/bank/sync").json()["added"] == 1
    assert fresh.get("/api/bootstrap").json()["start"] == "2026-06-01"
    assert "SQ *ELSE 1" in [b["raw"] for b in fresh.get("/api/bank/inbox").json()]
    card = next(a["id"] for a in fresh.get("/api/bootstrap").json()["accounts"] if a["kind"] == "card")
    assert fresh.get("/api/bootstrap").json()["months"][-1]["balances"][str(card)] == 5000  # still the bank's


def test_accept_many_skips_what_cannot_be_whole(fresh):
    accts = fresh.get("/api/setup").json()["items"][0]["accounts"]
    fresh.post("/api/setup", json={"history": "all", "accounts": [{"id": a["id"]} for a in accts]})
    ids = [b["id"] for b in fresh.get("/api/bank/inbox").json()]
    r = fresh.post("/api/bank/inbox/accept", json={"ids": ids})
    assert r.status_code == 200
