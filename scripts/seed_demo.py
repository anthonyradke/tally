"""Fill a fresh database with made-up data through the JSON API, for trying the app or taking screenshots.

    uv run python scripts/seed_demo.py data/demo.db
    TALLY_DB=data/demo.db uv run uvicorn app.main:app --port 8001

Refuses to touch a file that already exists. Entries run from start_month up to today, plus a few recurring
templates that post ahead."""
from __future__ import annotations
import os
import random
import sys
from datetime import date, timedelta
from pathlib import Path

path = Path(sys.argv[1] if len(sys.argv) > 1 else "data/demo.db")
if path.exists():
    sys.exit(f"{path} already exists; pick a new path.")
path.parent.mkdir(parents=True, exist_ok=True)
os.environ["TALLY_DB"] = str(path)
os.environ.setdefault("TALLY_RECEIPTS", str(path.parent / "demo-receipts"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402  (TALLY_DB must be set before the app imports)
from app.main import app  # noqa: E402

c = TestClient(app)
rng = random.Random(7)
today = date.today()
start = (today.replace(day=1) - timedelta(days=80)).replace(day=1)


def post(url: str, body: dict) -> dict:
    r = c.post(url, json=body)
    if r.status_code >= 400:
        sys.exit(f"{url} {body} -> {r.status_code} {r.text}")
    return r.json()


c.put("/api/settings", json={"start_month": start.isoformat(), "ef_months": 6})

acct = {a["name"]: a["id"] for a in (
    post("/api/accounts", {"name": "Checking", "kind": "cash", "bank": "Chase", "start_balance": 3240}),
    post("/api/accounts", {"name": "High-yield savings", "kind": "cash", "bank": "SoFi", "start_balance": 8600,
                           "apy": 3.8, "ef": True}),
    post("/api/accounts", {"name": "Credit card", "kind": "card", "bank": "Amex"}),
    post("/api/accounts", {"name": "Roth IRA", "kind": "investment", "start_balance": 5200}),
    post("/api/accounts", {"name": "Student loan", "kind": "loan", "start_balance": 14800, "loan_rate": 4.5}),
)}

CATS = [("Paycheck", "Money in", None), ("Interest", "Money in", None), ("Rent", "Spending", 1400),
        ("Groceries", "Spending", 450), ("Dining out", "Spending", 180), ("Gas", "Spending", 120),
        ("Subscriptions", "Spending", 45), ("Shopping", "Spending", 150), ("Utilities", "Spending", 130),
        ("Savings", "Saving", None), ("Roth IRA", "Saving", None), ("Card payment", "Transfer", None),
        ("Loan payment", "Loan", None)]
cat = {name: post("/api/categories", {"name": name, "type": t, "budget": b})["id"] for name, t, b in CATS}
c.put("/api/settings", json={"roth_category": cat["Roth IRA"], "interest_category": cat["Interest"]})

MERCHANTS = {"Groceries": ["Trader Joe's", "Costco", "Whole Foods", "Safeway"],
             "Dining out": ["Chipotle", "Starbucks", "Sweetgreen", "Local taqueria"],
             "Gas": ["Shell", "Chevron"], "Shopping": ["Target", "Amazon", "REI", "Uniqlo"]}
SPEND = {"Groceries": (18, 95, 0.30), "Dining out": (7, 38, 0.30), "Gas": (32, 55, 0.10), "Shopping": (14, 90, 0.12)}


def entry(d: date, what: str, category: str, amount: float, frm: str | None = None, to: str | None = None):
    post("/api/transactions", {"date": d.isoformat(), "what": what, "category_id": cat[category],
                               "from_id": acct[frm] if frm else None, "to_id": acct[to] if to else None,
                               "amount": round(amount, 2)})


d = start
while d <= today:
    if d.day in (1, 15):
        entry(d, "Acme Corp", "Paycheck", 2185.40, to="Checking")
    if d.day == 1:
        entry(d, "Rent", "Rent", 1400, frm="Checking")
        entry(d, "Transfer to savings", "Savings", 400, frm="Checking", to="High-yield savings")
        entry(d, "Roth contribution", "Roth IRA", 250, frm="Checking", to="Roth IRA")
    if d.day == 5:
        entry(d, "Spotify", "Subscriptions", 11.99, frm="Credit card")
        entry(d, "Netflix", "Subscriptions", 15.49, frm="Credit card")
    if d.day == 12:
        entry(d, "Xcel Energy", "Utilities", rng.uniform(70, 125), frm="Checking")
        entry(d, "Loan payment", "Loan payment", 320, frm="Checking", to="Student loan")
    if d.day == 20:
        entry(d, "Pay off card", "Card payment", 900, frm="Checking", to="Credit card")
    for category, (lo, hi, p) in SPEND.items():
        if rng.random() < p:
            entry(d, rng.choice(MERCHANTS[category]), category, rng.uniform(lo, hi), frm="Credit card")
    d += timedelta(days=1)

for label, category, amount, frm in (("Coffee", "Dining out", 5.75, "Credit card"),
                                     ("Groceries", "Groceries", None, "Credit card"),
                                     ("Gas", "Gas", None, "Credit card")):
    post("/api/favorites", {"label": label, "category_id": cat[category], "from_account_id": acct[frm],
                            "amount": amount})

nxt = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
post("/api/recurring", {"label": "Rent", "category_id": cat["Rent"], "from_account_id": acct["Checking"],
                        "amount": 1400, "what": "Rent", "freq": "monthly", "next_date": nxt.isoformat()})
post("/api/recurring", {"label": "Spotify", "category_id": cat["Subscriptions"], "from_account_id": acct["Credit card"],
                        "amount": 11.99, "what": "Spotify", "freq": "monthly",
                        "next_date": (today.replace(day=5) + timedelta(days=31)).replace(day=5).isoformat()})

n = c.get("/api/transactions?limit=1").json()["total"]
print(f"Seeded {path}: {len(acct)} accounts, {len(cat)} categories, {n} entries.")
