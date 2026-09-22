# Tally

I used to track my money in a spreadsheet. Tally is the app I built to replace it. It runs on my home server and
I use it from my phone every day.

<p>
  <img src="docs/home.png" width="200" alt="Home screen with net worth and monthly spending">
  <img src="docs/add.png" width="200" alt="Adding an entry with the keypad">
  <img src="docs/insights.png" width="200" alt="Monthly insights">
  <img src="docs/accounts.png" width="200" alt="Account balances">
</p>

The screenshots use fake data from `scripts/seed_demo.py`.

## Stack

Backend is Python 3.13 with FastAPI and SQLite. No ORM, just the standard library `sqlite3` module.

Frontend is React 19 and TypeScript, built with Vite. It's a PWA, so it installs to the iPhone home screen and
works offline for reading. Styling is plain CSS modules with no UI library.

## How it works

Every entry is a single row with a date, a name, a category, an amount, and a From and/or To account.
Balances are never stored. They're calculated from the rows every time, in `app/engine.py`. That file has no
database access, which makes it easy to test.

The category decides which accounts an entry needs:

| Category type | From | To |
|---|---|---|
| Money in | no | yes |
| Spending | yes | no |
| Transfer | yes | yes |
| Saving, Loan | yes | optional |

The API rejects anything that breaks these rules.

Money is stored as whole cents everywhere to avoid floating point errors. The only place dollars show up is in
request bodies, and they get converted once when they come in.

## Features

- A home screen of widgets you can rearrange: net worth, spending compared to last month, budgets, emergency
  fund, and upcoming bills.
- A custom keypad for adding entries, with shortcuts for things I log often.
- Search across names, notes, tags and amounts. Saved filters and bulk editing.
- Deleting is instant with an undo button instead of a confirmation popup.
- Reconciling an account against the bank balance, and a checklist for the end of each month.
- Recurring entries like rent and subscriptions post automatically.
- Budgets that show whether you're on pace for the month.
- New entries made offline get saved on the phone and sync later without duplicating.
- CSV export.

When I switched over, `app/importer.py` pulled in the old spreadsheet and checked that every balance matched to
the cent.

## Running it

You'll need [uv](https://docs.astral.sh/uv/) and Node 22.

```sh
uv sync
cd web && npm ci && npm run build && cd ..
uv run python scripts/seed_demo.py data/demo.db
TALLY_DB=data/demo.db uv run uvicorn app.main:app --port 8000
```

Open http://localhost:8000. The seed step is optional. Skip it and set no `TALLY_DB` to start with an empty
database.

For frontend work, run `npm run dev` inside `web/`. It serves on port 5173 and forwards API calls to 8000.

Tests: `uv run pytest`

There's no login. Mine is only reachable over my private network, so don't put it on the open internet as is.

## Where things are

```
app/engine.py       balance calculations
app/db.py           database schema and connections
app/migrate.py      schema changes
app/api*.py         the JSON API
app/recurring.py    recurring entries
app/importer.py     spreadsheet import
app/main.py         app setup, CSV export, serves the frontend
web/src/screens     the app's pages
web/src/components  keypad, charts, sheets and other UI pieces
tests/              tests, each against a throwaway database
scripts/            demo data and backups
```

Design rules are in `DESIGN.md`. Release notes are in `CHANGELOG.md`.
