"""Additive schema migrations for the 2026-09 rebuild. Idempotent; db.connect() runs this after SCHEMA.

Nothing here changes how the engine reads rows: new transaction columns are metadata the engine ignores.
Split transactions are ordinary rows sharing a `split_group`; budgets/recurring/saved_views are new tables."""
from __future__ import annotations
import sqlite3

COLUMNS: dict[str, list[tuple[str, str]]] = {
    "categories":   [("icon", "TEXT"), ("color", "TEXT"), ("budget", "INTEGER")],
    "accounts":     [("icon", "TEXT"), ("color", "TEXT")],
    "transactions": [("note", "TEXT NOT NULL DEFAULT ''"), ("tags", "TEXT NOT NULL DEFAULT ''"),
                     ("split_group", "TEXT"), ("receipt", "TEXT"), ("recurring_id", "INTEGER")],
    "favorites":    [("icon", "TEXT"), ("color", "TEXT")],
}

TABLES = """
CREATE TABLE IF NOT EXISTS budgets(
  category_id INTEGER NOT NULL REFERENCES categories(id), month TEXT NOT NULL,
  amount INTEGER NOT NULL, PRIMARY KEY(category_id, month));
CREATE TABLE IF NOT EXISTS recurring(
  id INTEGER PRIMARY KEY, label TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  from_account_id INTEGER REFERENCES accounts(id), to_account_id INTEGER REFERENCES accounts(id),
  amount INTEGER NOT NULL, what TEXT NOT NULL DEFAULT '',
  freq TEXT NOT NULL CHECK(freq IN ('weekly','biweekly','monthly','yearly')),
  next_date TEXT NOT NULL, horizon_days INTEGER NOT NULL DEFAULT 45,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS saved_views(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, query TEXT NOT NULL, icon TEXT,
  sort INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS tx_split ON transactions(split_group);
CREATE INDEX IF NOT EXISTS tx_recurring ON transactions(recurring_id);
"""


def migrate(con: sqlite3.Connection) -> None:
    for table, cols in COLUMNS.items():
        have = {r[1] for r in con.execute(f"PRAGMA table_info({table})")}
        for name, ddl in cols:
            if name not in have:
                con.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
    con.executescript(TABLES)
