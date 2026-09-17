"""Glue between the database and the engine: one loaded state object per request."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import date
from typing import Optional
from . import db
from .engine import (Account, Category, Txn, MonthRow, month_table, month_range, month_of,
                     emergency_fund, diagnose, expected_balance, propose_interest, validate,
                     month_end, cents)


@dataclass
class State:
    con: object
    accounts: list
    categories: list
    txns: list
    typed: dict
    start: date
    today: date
    months: list
    rows: list

    @property
    def acct(self) -> dict[int, Account]:
        return {a.id: a for a in self.accounts}

    @property
    def cat(self) -> dict[int, Category]:
        return {c.id: c for c in self.categories}

    @property
    def current(self) -> MonthRow:
        return next(r for r in self.rows if r.month == month_of(self.today))

    def ef(self) -> tuple[int, int]:
        return emergency_fund(self.rows, self.accounts, int(db.setting(self.con, "ef_months")), self.today)

    def roth_ytd(self) -> int:
        rid = next((c.id for c in self.categories if c.name == "Roth IRA"), None)
        return sum(t.amount for t in self.txns
                   if t.category_id == rid and t.date.year == self.today.year)

    def by_kind(self, kind: str) -> list[Account]:
        return [a for a in self.accounts if a.kind == kind]

    def recent(self, n: int = 80) -> list[Txn]:
        return sorted(self.txns, key=lambda t: (t.date, t.id or 0), reverse=True)[:n]

    def diagnose(self, account: Account, actual: int, as_of: Optional[date] = None):
        return diagnose(account, self.accounts, self.txns, self.typed, self.start,
                        as_of or self.today, actual)

    def expected(self, account: Account, as_of: Optional[date] = None) -> int:
        return expected_balance(account, self.accounts, self.txns, self.typed, self.start,
                                as_of or self.today)

    # ----- month-end -----
    def month_end_status(self, m: date) -> dict:
        inv = self.by_kind("investment")
        typed = {a.id: self.typed.get((a.id, m)) for a in inv}
        hysas = [a for a in self.accounts if a.kind == "cash" and a.apy]
        income = next((c.id for c in self.categories if c.name == "Other Income"), None)
        interest = {}
        for a in hysas:
            done = [t for t in self.txns if t.to_id == a.id and t.category_id == income
                    and month_of(t.date) == m and "interest" in t.what.lower()]
            bal = next(r for r in self.rows if r.month == m).balances[a.id]
            interest[a.id] = {"logged": done, "proposed": propose_interest(bal, a.apy)}
        recon = {}
        end = month_end(m)
        for a in self.by_kind("cash") + self.by_kind("card"):
            r = self.con.execute(
                "SELECT * FROM reconciliations WHERE account_id=? AND date>=? AND date<=? "
                "ORDER BY date DESC, id DESC LIMIT 1",
                (a.id, m.isoformat(), end.isoformat())).fetchone()
            recon[a.id] = dict(r) if r else None
        return {"typed": typed, "interest": interest, "recon": recon,
                "typed_done": all(v is not None for v in typed.values()),
                "interest_done": all(v["logged"] for v in interest.values()),
                "recon_done": all(v and v["actual"] == v["expected"] for v in recon.values())}


def load(con, today: Optional[date] = None) -> State:
    today = today or date.today()
    accounts, cats = db.load_accounts(con), db.load_categories(con)
    txns, typed = db.load_txns(con), db.load_typed(con)
    start = date.fromisoformat(db.setting(con, "start_month"))
    last = max([today] + [t.date for t in txns] + [m for _, m in typed])
    months = month_range(start, last)
    rows = month_table(accounts, cats, txns, typed, months)
    return State(con, accounts, cats, txns, typed, start, today, months, rows)


def txn_from_form(f, txn_id: Optional[int] = None) -> Txn:
    def opt(k):
        v = f.get(k)
        return int(v) if v else None
    return Txn(txn_id, date.fromisoformat(f["date"]), (f.get("what") or "").strip(),
               int(f["category_id"]), opt("from_account_id"), opt("to_account_id"),
               cents(f["amount"] or 0))


def save_txn(con, st: State, t: Txn) -> list[str]:
    errs = validate(t, st.cat[t.category_id].type, st.acct)
    if errs:
        return errs
    if t.id:
        db.update_txn(con, t)
    else:
        db.insert_txn(con, t)
    con.commit()
    return []
