"""Money and date math: cents parsing, balances that reconcile, month boundaries, leap years, local "today".
Property tests (Hypothesis) build random made-up ledgers and check the engine's identities hold for all of them."""
from __future__ import annotations
import json
import os
import subprocess
import sys
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
import pytest
from hypothesis import given, settings, strategies as st
from app.engine import (Account, Category, Txn, SHAPES, balances, cents, diagnose, dollars, emergency_fund,
                        expected_balance, month_end, month_of, month_range, month_table, next_month, validate)
from .conftest import freeze, txn

# ---------- cents ----------

@given(st.integers(min_value=-10**11, max_value=10**11))
def test_cents_round_trips_what_the_app_sends(n):
    """The app sends `cents / 100` as a JSON number; the server must land on the same integer."""
    assert cents(json.loads(json.dumps(n / 100))) == n
    assert cents(str(Decimal(n) / 100)) == n


@given(st.decimals(min_value=-10**9, max_value=10**9, places=3, allow_nan=False, allow_infinity=False))
def test_cents_is_half_up_away_from_zero(d):
    c = cents(str(d))
    exact = d * 100
    assert abs(c - exact) <= Decimal("0.5")
    if abs(exact - int(exact)) == Decimal("0.5"):
        assert abs(c) > abs(exact)  # halves round away from zero


@pytest.mark.parametrize("x,want", [("0.005", 1), ("-0.005", -1), ("1.005", 101), (1.005, 101), ("2.675", 268),
                                    (0.1 + 0.2, 30), ("12", 1200), (12, 1200), ("-0", 0), ("1e2", 10000)])
def test_cents_examples(x, want):
    assert cents(x) == want


def test_dollars_format():
    assert dollars(0) == "$0.00" and dollars(-123456) == "-$1,234.56" and dollars(5) == "$0.05"


# ---------- months ----------

def test_month_helpers_at_the_edges():
    assert next_month(date(2026, 12, 1)) == date(2027, 1, 1)
    assert month_end(date(2028, 2, 1)) == date(2028, 2, 29)   # leap year
    assert month_end(date(2026, 2, 1)) == date(2026, 2, 28)
    assert month_end(date(2100, 2, 1)) == date(2100, 2, 28)   # century, not a leap year
    assert month_end(date(2000, 2, 1)) == date(2000, 2, 29)
    assert month_range(date(2026, 11, 15), date(2027, 2, 1)) == [date(2026, 11, 1), date(2026, 12, 1),
                                                                 date(2027, 1, 1), date(2027, 2, 1)]
    assert month_range(date(2026, 9, 30), date(2026, 9, 1)) == [date(2026, 9, 1)]


@given(st.dates(min_value=date(1990, 1, 1), max_value=date(2100, 12, 31)))
def test_month_of_and_end_contain_the_day(d):
    m = month_of(d)
    assert m <= d <= month_end(m) and (month_end(m) + timedelta(days=1)).day == 1


# ---------- balances reconcile ----------

ACCTS = [Account(1, "Checking", "cash", 100_00), Account(2, "Savings", "cash", 5_000_00, apy=0.04, ef=True),
         Account(3, "Card", "card", 250_00), Account(4, "IRA", "investment", 2_000_00),
         Account(5, "Loan", "loan", 10_000_00, loan_rate=0.06)]
CATS = [Category(1, "Pay", "Money in"), Category(2, "Food", "Spending"), Category(3, "Move", "Transfer"),
        Category(4, "Roth", "Saving"), Category(5, "Loan", "Loan")]
START = date(2027, 12, 1)  # runs through the leap day in Feb 2028


@st.composite
def ledger(draw):
    """A random made-up ledger in which every row obeys its category's From/To rules."""
    rows = []
    for i in range(draw(st.integers(0, 40))):
        cat = draw(st.sampled_from(CATS))
        f_rule, t_rule = SHAPES[cat.type]
        frm = None if f_rule == "blank" else draw(st.sampled_from([1, 2, 3]))
        to_choices = [a for a in (1, 2, 3, 5) if a != frm]
        to = None
        if t_rule == "required" or (t_rule == "optional" and draw(st.booleans())):
            to = draw(st.sampled_from(to_choices))
        amount = draw(st.integers(-50_000, 500_000).filter(bool))
        day = draw(st.dates(min_value=START, max_value=date(2028, 3, 31)))
        t = Txn(i + 1, day, f"row {i}", cat.id, frm, to, amount)
        assert validate(t, cat.type, {a.id: a for a in ACCTS}) == []
        rows.append(t)
    return rows


@settings(max_examples=200, deadline=None)
@given(ledger())
def test_balances_reconcile_with_the_rows(rows):
    months = month_range(START, date(2028, 3, 1))
    table = month_table(ACCTS, CATS, rows, {}, months)
    last = table[-1].balances
    ins = lambda a: sum(t.amount for t in rows if t.to_id == a)
    outs = lambda a: sum(t.amount for t in rows if t.from_id == a)
    assert last[1] == 100_00 + ins(1) - outs(1)
    assert last[2] == 5_000_00 + ins(2) - outs(2)
    assert last[3] == 250_00 + outs(3) - ins(3)
    assert last[4] == 2_000_00  # untyped investments carry their start
    for r in table:
        in_month = [t for t in rows if month_of(t.date) == r.month]
        by = lambda ty, rows_=in_month: sum(t.amount for t in rows_ if CATS[t.category_id - 1].type == ty)
        assert (r.money_in, r.spent, r.saving, r.loan) == (by("Money in"), by("Spending"), by("Saving"), by("Loan"))
        assert r.left_over == r.money_in - r.spent - r.loan - r.saving
        assert sum(r.by_category.values()) == sum(t.amount for t in in_month)
        assert r.net_worth == r.cash + r.invested - r.cards - r.loans
        assert r.cash == r.balances[1] + r.balances[2] and r.cards == r.balances[3] and r.loans == r.balances[5]
        assert r.balances[5] >= 0
    # the reconcile screen's figure is the same engine, cut at a date
    end = date(2028, 3, 31)
    for a in ACCTS[:3]:
        assert expected_balance(a, ACCTS, rows, {}, START, end) == last[a.id]


@settings(max_examples=100, deadline=None)
@given(st.lists(st.integers(1, 1_000_000), min_size=1, max_size=10))
def test_transfers_between_cash_accounts_leave_total_cash_alone(amounts):
    rows = [Txn(i, date(2028, 1, 1 + i), "", 3, 1, 2, a) for i, a in enumerate(amounts)]
    t = month_table(ACCTS, CATS, rows, {}, [date(2028, 1, 1)])[0]
    base = month_table(ACCTS, CATS, [], {}, [date(2028, 1, 1)])[0]
    assert t.cash == base.cash and t.net_worth == base.net_worth and t.left_over == 0


def test_month_boundaries_and_leap_day():
    rows = [Txn(1, date(2028, 1, 31), "", 2, 1, None, 100), Txn(2, date(2028, 2, 1), "", 2, 1, None, 200),
            Txn(3, date(2028, 2, 29), "", 2, 1, None, 400), Txn(4, date(2028, 3, 1), "", 2, 1, None, 800)]
    t = month_table(ACCTS, CATS, rows, {}, month_range(date(2028, 1, 1), date(2028, 3, 1)))
    assert [r.spent for r in t] == [100, 600, 800]
    assert [r.balances[1] for r in t] == [100_00 - 100, 100_00 - 700, 100_00 - 1500]


def test_rows_before_the_start_month_count_nowhere():
    """The start balances already include them (the spreadsheet rule), so balances and totals skip them."""
    rows = [Txn(1, date(2027, 11, 30), "", 2, 1, None, 999)]
    t = month_table(ACCTS, CATS, rows, {}, [START])
    assert t[0].spent == 0 and t[0].balances[1] == 100_00


def test_loan_accrues_half_up_and_floors_at_zero():
    loan = Account(1, "L", "loan", 100_001, loan_rate=0.06)
    b = balances([loan], [], {}, [date(2028, 1, 1), date(2028, 2, 1)])
    assert b[date(2028, 1, 1)][1] == 100_501  # 100001 * 1.005 = 100501.005
    paid = [Txn(1, date(2028, 1, 5), "", 5, None, 1, 999_999)]
    assert balances([loan], paid, {}, [date(2028, 1, 1)])[date(2028, 1, 1)][1] == 0


def test_typed_balances_carry_forward():
    typed = {(4, date(2028, 1, 1)): 2_500_00}
    t = month_table(ACCTS, CATS, [], typed, month_range(START, date(2028, 3, 1)))
    assert [r.balances[4] for r in t] == [2_000_00, 2_500_00, 2_500_00, 2_500_00]


def test_emergency_fund_uses_completed_months_only():
    rows = [Txn(1, date(2028, 1, 10), "", 2, 1, None, 300_00), Txn(2, date(2028, 2, 3), "", 2, 1, None, 5_000_00)]
    t = month_table(ACCTS, CATS, rows, {}, month_range(date(2028, 1, 1), date(2028, 2, 1)))
    goal, progress = emergency_fund(t, ACCTS, 6, date(2028, 2, 3))
    assert goal == 300_00 * 6 and progress == 5_000_00


def test_diagnose_ignores_future_rows():
    rows = [Txn(1, date(2028, 1, 5), "", 2, 1, None, 40_00), Txn(2, date(2028, 1, 20), "", 2, 1, None, 60_00)]
    d = diagnose(ACCTS[0], ACCTS, rows, {}, date(2028, 1, 1), date(2028, 1, 10), 20_00)
    assert d.expected == 60_00 and d.gap == -40_00 and [t.id for t in d.single] == [1] and [t.id for t in d.future] == [2]


# ---------- through the API ----------

def test_api_totals_agree_everywhere(client, world, monkeypatch):
    """The same made-up month seen four ways: the month row, the filtered list, the CSV export, balances."""
    freeze(monkeypatch, date(2026, 9, 20))
    client.put("/api/settings", json={"start_month": "2026-08-01"})
    bodies = [txn(world, date="2026-08-31", amount=10.01), txn(world, date="2026-09-01", amount=20.02),
              txn(world, date="2026-09-30", amount=0.03), txn(world, "in", date="2026-09-15", amount=1000),
              txn(world, "move", date="2026-09-16", amount=250.5), txn(world, date="2026-10-01", amount=7),
              txn(world, amount=-5.25, date="2026-09-10")]  # a refund
    for b in bodies:
        assert client.post("/api/transactions", json=b).status_code == 201
    boot = client.get("/api/bootstrap").json()
    assert boot["today"] == "2026-09-20"
    sept = next(m for m in boot["months"] if m["month"] == "2026-09-01")
    listed = client.get("/api/transactions?type=Spending&start=2026-09-01&end=2026-09-30").json()
    assert sept["spent"] == listed["sum"] == 2002 + 3 - 525
    assert [m["month"] for m in boot["months"]] == ["2026-08-01", "2026-09-01", "2026-10-01"]  # the future row adds Oct
    chk = str(world["chk"])
    assert sept["balances"][chk] == 1000_00 + 1000_00 - 250_50
    csv = client.get("/export/months.csv").text.splitlines()
    assert csv[2].startswith("2026-09-01,1000.0,")


def test_server_today_is_local_not_utc():
    """x1 runs on UTC; the unit sets TZ=America/Denver so 'today' flips at local midnight, not 6 pm."""
    code = ("from datetime import datetime, date; from zoneinfo import ZoneInfo;"
            "print(date.today() == datetime.now(ZoneInfo('America/Denver')).date())")
    out = subprocess.run([sys.executable, "-c", code], env={**os.environ, "TZ": "America/Denver"},
                         capture_output=True, text=True, check=True)
    assert out.stdout.strip() == "True"


def test_no_business_date_comes_from_sqlite_now():
    """SQLite's date('now') is always UTC. Only created_at bookkeeping columns may use it."""
    for p in Path("app").glob("*.py"):
        for line in p.read_text().splitlines():
            if "'now'" in line:
                assert "created_at" in line, f"{p}: {line.strip()}"


@pytest.mark.parametrize("today,current", [("2026-09-30", "2026-09-01"), ("2026-10-01", "2026-10-01"),
                                           ("2028-02-29", "2028-02-01"), ("2026-12-31", "2026-12-01")])
def test_this_month_follows_local_today(client, world, monkeypatch, today, current):
    """Around local midnight the current month is whatever today's date says, even with a row dated tomorrow."""
    d = date.fromisoformat(today)
    freeze(monkeypatch, d)
    client.post("/api/transactions", json=txn(world, date=(d + timedelta(days=1)).isoformat()))
    boot = client.get("/api/bootstrap").json()
    assert boot["today"] == today
    assert current in [m["month"] for m in boot["months"]]
    assert boot["months"][-1]["month"] == month_of(d + timedelta(days=1)).isoformat()
