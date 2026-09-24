"""Glue between the database and the engine: one loaded state object per request."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import date
from typing import Optional
from . import db
from .engine import (Account, Category, MonthRow, month_table, month_range, month_of,
                     emergency_fund, diagnose, expected_balance, propose_interest, month_end)


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
    hidden: frozenset = frozenset()  # ids of accounts switched off in Settings: still counted, left off checklists

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

    def category_for(self, key: str, default_name: str) -> Optional[int]:
        """A category picked in Settings (roth_category, interest_category), by id so renaming it can't break the
        link. Falls back to the default name for databases that never stored the pick."""
        row = self.con.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        if row is None:
            return next((c.id for c in self.categories if c.name == default_name), None)
        return int(row[0]) if row[0] and int(row[0]) in self.cat else None  # "" = switched off in Settings

    def roth_ytd(self) -> int:
        rid = self.category_for("roth_category", "Roth IRA")
        return sum(t.amount for t in self.txns
                   if t.category_id == rid and t.date.year == self.today.year)

    def by_kind(self, kind: str) -> list[Account]:
        return [a for a in self.accounts if a.kind == kind and a.id not in self.hidden]

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
        hysas = [a for a in self.by_kind("cash") if a.apy]
        income = self.category_for("interest_category", "Other Income")
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
    """Hidden (inactive) accounts and categories load too: their entries still exist, so balances, totals and
    exports must count them. Settings' Active switch only takes them out of pickers and checklists."""
    today = today or date.today()
    accounts, cats = db.load_accounts(con, active_only=False), db.load_categories(con, active_only=False)
    hidden = frozenset(r[0] for r in con.execute("SELECT id FROM accounts WHERE active=0"))
    txns, typed = db.load_txns(con), db.load_typed(con)
    start = date.fromisoformat(db.setting(con, "start_month"))
    last = max([today] + [t.date for t in txns] + [m for _, m in typed])
    months = month_range(start, last)
    rows = month_table(accounts, cats, txns, typed, months)
    return State(con, accounts, cats, txns, typed, start, today, months, rows, hidden)
