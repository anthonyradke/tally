"""SQLite schema and loaders. Amounts are integer cents everywhere."""
from __future__ import annotations
import os, sqlite3
from datetime import date
from typing import Optional
from .engine import Account, Category, Txn
from .migrate import migrate

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts(
  id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('cash','card','investment','loan')),
  bank TEXT, start_balance INTEGER NOT NULL DEFAULT 0,
  apy REAL, loan_rate REAL, ef INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS categories(
  id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('Money in','Spending','Saving','Transfer','Loan')),
  sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS transactions(
  id INTEGER PRIMARY KEY, date TEXT NOT NULL, what TEXT NOT NULL DEFAULT '',
  category_id INTEGER NOT NULL REFERENCES categories(id),
  from_account_id INTEGER REFERENCES accounts(id),
  to_account_id INTEGER REFERENCES accounts(id),
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS tx_date ON transactions(date);
CREATE TABLE IF NOT EXISTS typed_balances(
  account_id INTEGER NOT NULL REFERENCES accounts(id), month TEXT NOT NULL,
  balance INTEGER NOT NULL, PRIMARY KEY(account_id, month));
CREATE TABLE IF NOT EXISTS reconciliations(
  id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
  date TEXT NOT NULL, actual INTEGER NOT NULL, expected INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS favorites(
  id INTEGER PRIMARY KEY, label TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  from_account_id INTEGER REFERENCES accounts(id),
  to_account_id INTEGER REFERENCES accounts(id),
  amount INTEGER, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""

DEFAULT_SETTINGS = {"start_month": "2026-08-01", "ef_months": "6", "roth_limit": "750000"}


def connect(path: Optional[str] = None) -> sqlite3.Connection:
    path = path or os.environ.get("MONEY_DB", "data/money.db")
    if path != ":memory:":
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    con = sqlite3.connect(path, detect_types=0)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(SCHEMA)
    migrate(con)  # additive 2026-09 columns/tables; idempotent
    for k, v in DEFAULT_SETTINGS.items():
        con.execute("INSERT OR IGNORE INTO settings VALUES(?,?)", (k, v))
    con.commit()
    return con


def setting(con, key: str) -> str:
    return con.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()[0]


def set_setting(con, key: str, value: str) -> None:
    con.execute("INSERT OR REPLACE INTO settings VALUES(?,?)", (key, value))


def load_accounts(con, active_only=True) -> list[Account]:
    q = "SELECT * FROM accounts" + (" WHERE active=1" if active_only else "") + " ORDER BY sort, id"
    return [Account(r["id"], r["name"], r["kind"], r["start_balance"], r["apy"],
                    r["loan_rate"], r["bank"], bool(r["ef"])) for r in con.execute(q)]


def load_categories(con, active_only=True) -> list[Category]:
    q = "SELECT * FROM categories" + (" WHERE active=1" if active_only else "") + " ORDER BY sort, id"
    return [Category(r["id"], r["name"], r["type"]) for r in con.execute(q)]


def load_txns(con) -> list[Txn]:
    rows = con.execute("SELECT * FROM transactions ORDER BY date, id")
    return [Txn(r["id"], date.fromisoformat(r["date"]), r["what"], r["category_id"],
                r["from_account_id"], r["to_account_id"], r["amount"]) for r in rows]


def load_typed(con) -> dict[tuple[int, date], int]:
    return {(r["account_id"], date.fromisoformat(r["month"])): r["balance"]
            for r in con.execute("SELECT * FROM typed_balances")}


def insert_txn(con, t: Txn) -> int:
    cur = con.execute(
        "INSERT INTO transactions(date,what,category_id,from_account_id,to_account_id,amount)"
        " VALUES(?,?,?,?,?,?)",
        (t.date.isoformat(), t.what, t.category_id, t.from_id, t.to_id, t.amount))
    return cur.lastrowid


def update_txn(con, t: Txn) -> None:
    con.execute(
        "UPDATE transactions SET date=?,what=?,category_id=?,from_account_id=?,"
        "to_account_id=?,amount=? WHERE id=?",
        (t.date.isoformat(), t.what, t.category_id, t.from_id, t.to_id, t.amount, t.id))


def set_typed(con, account_id: int, month: date, balance: int) -> None:
    con.execute("INSERT OR REPLACE INTO typed_balances VALUES(?,?,?)",
                (account_id, month.isoformat(), balance))
