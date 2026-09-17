# Money

Replaces money.xlsx. Same From/To model, same balance rules, one SQLite file.

## Run locally (Mac, first time)
Needs uv: `curl -LsSf https://astral.sh/uv/install.sh | sh`
    uv sync                                    # installs Python 3.13 (pinned in .python-version) and deps
    uv run python -m app.importer ~/path/to/money.xlsx      # empty DB only; prints a cent-exact verification
    uv run uvicorn app.main:app --port 8000                  # open http://localhost:8000

## Run on the server
    docker compose up -d --build
Copy `data/money.db` into `./data/` first if you imported on the Mac. Reach it over Tailscale;
never publish port 8000 beyond the tailnet. On the iPhone open the Tailscale URL in Safari,
Share, Add to Home Screen.

## Tests
    uv run pytest -q                              # engine
    MONEY_XLSX=~/path/to/money.xlsx uv run pytest -q   # plus import verification

## Screens
Log (favorites, entry, recent) · Balances (snapshot, reconcile per account) · Months (cards on
phone, full table on desktop) · Month end (typed balances, HYSA interest, reconcile status) · Settings.

## Rules the app enforces at entry
Money in: To only. Spending: From only. Transfer: both. Saving and Loan: From, To optional.
Loans: add as kind `loan` with balance on the log start date and annual rate; log payments with To = the loan.
HSA: typed balance, but usable as From so card swipes land in Health.

## Backup
`scripts/backup.sh` snapshots the DB and a log CSV to the iCloud Financial folder (or `DEST=`).
Export anytime: `/export/log.csv`, `/export/months.csv`.

## Layout
    app/engine.py    pure balance engine (no DB)      app/importer.py  xlsx import + verify
    app/db.py        schema, cents as integers        app/service.py   per-request state
    app/main.py      routes                           app/templates    HTMX + Jinja
