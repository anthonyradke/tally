# Tally

I used to track my money in a spreadsheet. Tally is what I built to replace it: an iPhone app backed by a small
server on my home server. I use it every day.

This repo has both halves:

- `app/` is the backend: Python 3.13, FastAPI and SQLite. It holds the data and all the money rules.
- `ios/` is the iPhone app: Expo (React Native), SDK 57. It stores nothing itself and talks to the backend over
  my private network (Tailscale).

Tally started as a web app (a React PWA), and the iPhone app began as a separate project called Tallyho. In 3.0.0
the iPhone app moved in here with its history and the web app was retired. Both are still in git history.

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

When I switched over, `app/importer.py` pulled in the old spreadsheet and checked that every balance matched to
the cent.

## What the app does

- Home shows net worth, this month's spending drawn against last month's pace (drag across the chart to read any
  day), quick actions, budgets, where the money went, goals, what's coming up and recent entries.
- Activity lists every entry grouped by day, with search, filters, saved views, a long-press menu (edit, duplicate,
  delete with undo) and multi-select for recategorizing, tagging or deleting.
- Adding an entry has a big keypad, merchant memory (type a name and it fills in the category and account from last
  time), date shortcuts, refunds, splits, notes, tags and receipt photos. If the phone can't reach the server, the
  entry waits on the phone and sends itself later, never twice.
- Accounts shows balances, what I own against what I owe, and for each account a balance chart and reconciling
  against the bank with a diagnosis when they don't match.
- Insights has a month-by-month spending donut, categories against budgets, cash flow, net worth, the month-end
  checklist and CSV export.
- Settings covers quick actions, recurring entries, saved views, accounts, categories, budgets (with suggestions
  from past spending), goals, the Home layout and the server address.

## Running the backend

You'll need [uv](https://docs.astral.sh/uv/).

```sh
uv sync
uv run python scripts/seed_demo.py data/demo.db
TALLY_DB=data/demo.db uv run uvicorn app.main:app --port 8000
```

The seed step is optional. Skip it and set no `TALLY_DB` to start with an empty database.

Tests: `uv run pytest`

There's no login. Mine is only reachable over my private network, so don't put it on the open internet as is.

## Running the app

Inside `ios/`:

```sh
npm install
echo 'EXPO_PUBLIC_TALLY_URL=https://<tally-host>:8443' > .env.local   # never committed
npx expo start
```

To try it on my iPhone with Expo Go, I open Expo Go and enter `exp://<server's Tailscale IP>:8082` (or scan the
QR code `expo start` prints). The phone needs Tailscale on.

To install it as a real app with a free Apple ID, I run `npx expo run:ios --device --configuration Release` on the
Mac with the iPhone plugged in and `.env.local` in place. The first time, I run `npx expo prebuild --platform ios`,
pick my Personal Team under Signing & Capabilities in `ios/ios/Tally.xcworkspace`, and trust the profile on the
phone under Settings › General › VPN & Device Management. With a paid Apple Developer account this would be
`eas build` and TestFlight instead.

A free Apple ID only signs apps for 7 days, and after that Tally won't open. I plug the phone in, unlock it and run
the same command again. It installs over the old copy, so cached data and any
entries still waiting to send stay on the phone. If signing fails, I check that my Apple ID is still signed in
under Xcode › Settings › Apple Accounts.

To check layouts on the server without a phone, run `npx expo start --web --port 8082` plus
`node scripts/preview.mjs`, then open `http://127.0.0.1:8090`. Set `API_PORT=8001` to point it at a backend
running on a copy of the database, so testing never writes to the real one.

## Where things are

```
app/engine.py        balance calculations
app/db.py            database schema and connections
app/migrate.py       schema changes
app/api*.py          the JSON API
app/recurring.py     recurring entries
app/importer.py      spreadsheet import
app/main.py          app setup and CSV export
tests/               backend tests, each against a throwaway database
scripts/             demo data and backups
ios/src/app          the app's screens, one file per route (Expo Router)
ios/src/components   rolling digits, the scrub chart, rows, panels, the keypad
ios/src/lib          the API client and the money rules the screens need
ios/src/theme        colors, type and spacing
```

Design notes are in `ios/DESIGN.md`. Release notes are in `CHANGELOG.md`.
