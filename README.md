# Money

Replaces money.xlsx. Same From/To model, same balance rules, one SQLite file.

## Run locally (Mac, first time)
Needs uv: `curl -LsSf https://astral.sh/uv/install.sh | sh`
    uv sync                                    # installs Python 3.13 (pinned in .python-version) and deps
    uv run python -m app.importer ~/path/to/money.xlsx      # empty DB only; prints a cent-exact verification
    uv run uvicorn app.main:app --port 8000                  # open http://localhost:8000

## Deployed on x1 (no Docker)
Runs as `money.service` (systemd, User=tony) from `~/projects/money` with its own uv-managed `.venv`,
bound to `127.0.0.1:8000` and published tailnet-only by Tailscale Serve at
**https://x1.tailea62fa.ts.net:8443**. On the iPhone: open that URL in Safari, Share, Add to Home Screen.

    ssh x1 "systemctl status money"; ssh x1 "journalctl -u money -f"
    # deploy a change from the Mac:
    rsync -a --exclude .venv --exclude data --exclude __pycache__ ~/code/money/ x1:projects/money/ && ssh x1 "cd projects/money && ~/.local/bin/uv sync --frozen && sudo systemctl restart money"

Database lives only on x1 at `~/projects/money/data/money.db` (never rsync `data/` over it).

## Backup
x1 cron (03:15) runs `scripts/backup-x1.sh`: SQLite snapshot to `x1:~/backups/money/`, 30 kept.
The Mac launchd job `com.ar.money-backup` (09:00 daily) runs `scripts/pull-backup-mac.sh`, which rsyncs that
folder into iCloud `Financial/money-backups/`. Export anytime: `/export/log.csv`, `/export/months.csv`.

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

## Layout
    app/engine.py    pure balance engine (no DB)      app/importer.py  xlsx import + verify
    app/db.py        schema, cents as integers        app/service.py   per-request state
    app/main.py      routes                           app/templates    HTMX + Jinja
