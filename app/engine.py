"""Balance engine. Pure functions, integer cents, no database.

Rules (from the workbook):
  cash account  = prior + sum(To == it) - sum(From == it)
  credit card   = prior + sum(From == it) - sum(To == it)
  investment    = typed for the month, else carried forward; From/To never move it
  loan          = round(prior * (1 + rate/12)) - sum(To == it), floored at 0
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

TYPES = ("Money in", "Spending", "Saving", "Transfer", "Loan")
KINDS = ("cash", "card", "investment", "loan")


@dataclass(frozen=True)
class Account:
    id: int
    name: str
    kind: str
    start_balance: int = 0
    apy: Optional[float] = None
    loan_rate: Optional[float] = None
    bank: Optional[str] = None
    ef: bool = False


@dataclass(frozen=True)
class Category:
    id: int
    name: str
    type: str


@dataclass(frozen=True)
class Txn:
    id: Optional[int]
    date: date
    what: str
    category_id: int
    from_id: Optional[int]
    to_id: Optional[int]
    amount: int


@dataclass
class MonthRow:
    month: date
    money_in: int = 0
    by_category: dict = field(default_factory=dict)
    spent: int = 0
    loan: int = 0
    saving: int = 0
    left_over: int = 0
    balances: dict = field(default_factory=dict)
    cash: int = 0
    invested: int = 0
    cards: int = 0
    loans: int = 0
    net_worth: int = 0


# ---------- dates ----------

def month_of(d: date) -> date:
    return date(d.year, d.month, 1)


def next_month(m: date) -> date:
    return date(m.year + (m.month == 12), m.month % 12 + 1, 1)


def month_end(m: date) -> date:
    return next_month(m) - timedelta(days=1)


def month_range(start: date, end: date) -> list[date]:
    out, m = [], month_of(start)
    while m <= month_of(end):
        out.append(m)
        m = next_month(m)
    return out


# ---------- money ----------

def cents(x) -> int:
    """Decimal/float/str dollars -> integer cents, half-up."""
    return int(Decimal(str(x)).quantize(Decimal("0.01"), ROUND_HALF_UP) * 100)


def dollars(c: int) -> str:
    sign = "-" if c < 0 else ""
    return f"{sign}${abs(c) / 100:,.2f}"


def _accrue(balance: int, annual_rate: float) -> int:
    d = Decimal(balance) * (1 + Decimal(str(annual_rate)) / 12)
    return int(d.quantize(Decimal("1"), ROUND_HALF_UP))


# ---------- validation ----------

# (from, to): required / blank / optional
SHAPES = {
    "Money in": ("blank", "required"),
    "Spending": ("required", "blank"),
    "Transfer": ("required", "required"),
    "Saving": ("required", "optional"),
    "Loan": ("required", "optional"),
}
SHAPE_HINT = {
    "Money in": "Money in fills To only. Where did it land?",
    "Spending": "Spending fills From only. What paid for it?",
    "Transfer": "A transfer fills both From and To.",
    "Saving": "Saving leaves From. To is optional.",
    "Loan": "A loan payment leaves From. To is optional.",
}


def validate(t: Txn, cat_type: str, accounts: dict[int, Account]) -> list[str]:
    errs = []
    if t.amount == 0:
        errs.append("Amount can't be zero.")
    f_rule, t_rule = SHAPES[cat_type]
    hint = SHAPE_HINT[cat_type]
    if f_rule == "required" and not t.from_id:
        errs.append("From is required. " + hint)
    if f_rule == "blank" and t.from_id:
        errs.append("From must be blank. " + hint)
    if t_rule == "required" and not t.to_id:
        errs.append("To is required. " + hint)
    if t_rule == "blank" and t.to_id:
        errs.append("To must be blank. " + hint)
    if t.from_id and t.to_id and t.from_id == t.to_id:
        errs.append("From and To are the same account.")
    for aid in (t.from_id, t.to_id):
        if aid and aid not in accounts:
            errs.append("Unknown account.")
    return errs


# ---------- balances ----------

def balances(accounts: list[Account], txns: list[Txn], typed: dict[tuple[int, date], int],
             months: list[date]) -> dict[date, dict[int, int]]:
    by_month: dict[date, list[Txn]] = {m: [] for m in months}
    for t in txns:
        m = month_of(t.date)
        if m in by_month:
            by_month[m].append(t)
    prev = {a.id: a.start_balance for a in accounts}
    out = {}
    for m in months:
        cur = {}
        for a in accounts:
            ins = sum(t.amount for t in by_month[m] if t.to_id == a.id)
            outs = sum(t.amount for t in by_month[m] if t.from_id == a.id)
            if a.kind == "cash":
                cur[a.id] = prev[a.id] + ins - outs
            elif a.kind == "card":
                cur[a.id] = prev[a.id] + outs - ins
            elif a.kind == "investment":
                cur[a.id] = typed.get((a.id, m), prev[a.id])
            else:  # loan
                cur[a.id] = max(0, _accrue(prev[a.id], a.loan_rate or 0.0) - ins)
        out[m] = cur
        prev = cur
    return out


def month_table(accounts: list[Account], categories: list[Category], txns: list[Txn],
                typed: dict, months: list[date]) -> list[MonthRow]:
    cat = {c.id: c for c in categories}
    bal = balances(accounts, txns, typed, months)
    rows = {m: MonthRow(m, by_category={c.id: 0 for c in categories}) for m in months}
    for t in txns:
        r = rows.get(month_of(t.date))
        if r is None:
            continue
        c = cat[t.category_id]
        r.by_category[c.id] = r.by_category.get(c.id, 0) + t.amount
        if c.type == "Money in":
            r.money_in += t.amount
        elif c.type == "Spending":
            r.spent += t.amount
        elif c.type == "Loan":
            r.loan += t.amount
        elif c.type == "Saving":
            r.saving += t.amount
    for m, r in rows.items():
        r.left_over = r.money_in - r.spent - r.loan - r.saving
        r.balances = bal[m]
        for a in accounts:
            v = bal[m][a.id]
            if a.kind == "cash":
                r.cash += v
            elif a.kind == "investment":
                r.invested += v
            elif a.kind == "card":
                r.cards += v
            else:
                r.loans += v
        r.net_worth = r.cash + r.invested - r.cards - r.loans
    return [rows[m] for m in months]


def emergency_fund(rows: list[MonthRow], accounts: list[Account], ef_months: int,
                   today: date) -> tuple[int, int]:
    """(goal, progress). Goal averages completed months only; a part month never drags it."""
    done = [r.spent for r in rows if r.month < month_of(today)]
    if not done:
        done = [r.spent for r in rows]
    avg = sum(done) // len(done) if done else 0
    goal = avg * ef_months
    # Today's month, not the last row: a future-dated entry adds later months to the table.
    now = next((r for r in rows if r.month == month_of(today)), rows[-1] if rows else None)
    last = now.balances if now else {}
    progress = sum(last.get(a.id, 0) for a in accounts if a.ef)
    return goal, progress


# ---------- reconcile ----------

@dataclass
class Diagnosis:
    expected: int
    actual: int
    gap: int
    doubled: list = field(default_factory=list)   # income logged From instead of To
    single: list = field(default_factory=list)    # missing or duplicated row
    future: list = field(default_factory=list)    # pre-logged, not yet posted


def expected_balance(account: Account, accounts: list[Account], txns: list[Txn], typed: dict,
                     start: date, as_of: date) -> int:
    posted = [t for t in txns if t.date <= as_of]
    months = month_range(start, as_of)
    return balances(accounts, posted, typed, months)[months[-1]][account.id]


def diagnose(account: Account, accounts: list[Account], txns: list[Txn], typed: dict,
             start: date, as_of: date, actual: int) -> Diagnosis:
    exp = expected_balance(account, accounts, txns, typed, start, as_of)
    d = Diagnosis(exp, actual, actual - exp)
    touches = [t for t in txns if account.id in (t.from_id, t.to_id)]
    g = abs(d.gap)
    if g:
        d.doubled = [t for t in touches if 2 * abs(t.amount) == g and t.date <= as_of]
        d.single = [t for t in touches if abs(t.amount) == g and t.date <= as_of]
    d.future = [t for t in touches if t.date > as_of]
    return d


def propose_interest(balance_end: int, apy: Optional[float]) -> int:
    """Rough monthly interest to confirm at month end: balance * APY / 12."""
    if not apy:
        return 0
    return int((Decimal(balance_end) * Decimal(str(apy)) / 12).quantize(Decimal("1"), ROUND_HALF_UP))
