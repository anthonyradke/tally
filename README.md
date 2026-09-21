# Tally

Personal ledger that replaced `money.xlsx`. Formerly named `money`; everything (repo, service, paths, database) was renamed to Tally on 2026-09-21. Same From/To model and balance rules, one SQLite file, now with a
React PWA on top. Runs on x1 as `tally.service`; open **https://x1.tailea62fa.ts.net:8443/** on the tailnet
(iPhone: Share → Add to Home Screen — it installs as a standalone app with its own icon and works offline for
reading).

## Layout
    app/engine.py      pure balance engine (no DB)          app/importer.py   xlsx import + cent-exact verification
    app/db.py          schema, cents as integers            app/migrate.py    additive columns/tables for the rebuild
    app/service.py     per-request state                    app/recurring.py  templates → future-dated rows
    app/main.py        routers, CSV exports, SPA handler    app/api*.py       JSON API (core, ops, admin, files)
    web/               Vite + React + TypeScript frontend   web/scripts       icons.mjs (PWA icons)
    tests/             engine + API tests                   scripts/          backup-x1.sh (x1), pull-backup-mac.sh (Mac)
    DESIGN.md          the locked design spec ("Paper Ledger") — read before UI work

## Run on x1
    uv sync --frozen && (cd web && npm ci && npm run build)   # deps + frontend into app/static/dist
    sudo systemctl restart tally                              # Python changes only; a rebuild alone is picked up live
    uv run pytest -q                                          # 13 tests (engine + API)

Frontend dev loop: `cd web && npm run dev` (Vite on :5173, `/api` proxied to :8000). Point `TALLY_DB` at a copy of
the database for experiments; never at the live file.

## Screens (web/src/screens)
Home (customizable widgets: net worth, left over/spent, quick actions, emergency fund, budgets, spending, upcoming,
Roth, net-worth chart) · Activity (search, type/category/account/tag/date filters, sort, saved views, long-press
multi-select with bulk recategorize/tag/delete) · Add/Edit sheet (keypad, merchant memory, splits, notes, tags,
receipt photos, undo) · Accounts + account detail (balance chart, reconcile, typed balances) · Insights (month
picker, budgets, net worth, month-end checklist, months table, CSV) · Settings (quick actions, accounts,
categories with glyph/tint/budget, recurring, saved views, general, appearance).

## Rules the app enforces at entry
Money in: To only. Spending: From only. Transfer: both. Saving and Loan: From, To optional. Splits are ordinary
rows sharing a `split_group`. Recurring templates post rows ~45 days ahead; edit or delete them like any row.

## Data & backups
Database: `data/tally.db` (x1 only, never in git). Receipts: `data/receipts/`. x1 cron 03:15 runs
`scripts/backup-x1.sh` (SQLite online backup → `~/backups/tally/tally-YYYY-MM-DD.db`, receipts mirrored, 30
kept); the Mac launchd job `com.ar.money-backup` (label kept) pulls that folder into iCloud daily. Export anytime:
`/export/log.csv`, `/export/months.csv`.
