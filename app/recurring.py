"""Recurring templates → future-dated transaction rows.

Each active template carries `next_date`; generate() inserts a row for every due date up to
today + horizon_days and advances next_date past them. Generated rows are ordinary transactions
(tagged with recurring_id) — editing or deleting one never regenerates it, because next_date only moves forward.
The app already treats future-dated rows as "upcoming" and excludes them from reconcile."""
from __future__ import annotations
from datetime import date, timedelta
import sqlite3


def _clamp(y: int, m: int, d: int) -> date:
    last = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)).day
    return date(y, m, min(d, last))


def step(d: date, freq: str) -> date:
    if freq == "weekly":
        return d + timedelta(days=7)
    if freq == "biweekly":
        return d + timedelta(days=14)
    if freq == "yearly":
        return _clamp(d.year + 1, d.month, d.day)
    return _clamp(d.year + (d.month == 12), d.month % 12 + 1, d.day)  # monthly


def generate(con: sqlite3.Connection, today: date) -> int:
    """Returns the number of rows inserted."""
    n = 0
    for r in con.execute("SELECT * FROM recurring WHERE active=1").fetchall():
        nxt = date.fromisoformat(r["next_date"])
        limit = today + timedelta(days=r["horizon_days"])
        while nxt <= limit:
            con.execute(
                "INSERT INTO transactions(date,what,category_id,from_account_id,to_account_id,amount,recurring_id)"
                " VALUES(?,?,?,?,?,?,?)",
                (nxt.isoformat(), r["what"] or r["label"], r["category_id"], r["from_account_id"],
                 r["to_account_id"], r["amount"], r["id"]))
            n += 1
            nxt = step(nxt, r["freq"])
        if nxt.isoformat() != r["next_date"]:
            con.execute("UPDATE recurring SET next_date=? WHERE id=?", (nxt.isoformat(), r["id"]))
    if n:
        con.commit()
    return n
