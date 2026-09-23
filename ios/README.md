# Tally for iPhone

A native iOS app for [Tally](https://github.com/anthonyradke/tally), my personal finance app. It replaces the web app on my phone with real iOS parts: the Liquid Glass tab bar, native navigation and sheets, SF Symbols, haptics and system controls.

It doesn't store anything itself. It talks to the same Tally backend the web app uses (FastAPI and SQLite on my home server, reachable over Tailscale), so the phone, the web app and the nightly backups all see the same data.

## What's in it

- **Home**: net worth, this month's spending drawn against last month's pace (drag across the chart to read any day), quick actions, budgets, where the money went, goals, what's coming up and recent entries. The layout follows the Home settings I already had in Tally.
- **Activity**: every entry grouped by day, with search, type chips, filters, saved views, a long-press menu (edit, duplicate, delete with undo) and multi-select for recategorizing, tagging or deleting.
- **Add an entry**: a big keypad, the merchant memory Tally already had (type a name and it fills in the category and account from last time), date shortcuts, refunds, splits across categories, notes, tags and receipt photos. If the phone can't reach Tally, the entry waits on the phone and sends itself later.
- **Accounts**: balances as of today, what I own against what I owe, and for each account a balance chart, this month in and out, and reconciling against the bank with a diagnosis when they don't match.
- **Insights**: a month-by-month spending donut, categories against budgets, cash flow, net worth, the month-end checklist and CSV export.
- **Settings**: quick actions, recurring, saved views, accounts, categories, budgets (with suggestions from past spending), goals, the Home layout and the server address.

## Running it

It's an Expo (React Native) app, SDK 57.

```bash
npm install
echo 'EXPO_PUBLIC_TALLY_URL=https://<tally-host>:8443' > .env.local   # never committed
npx expo start
```

**On my iPhone with Expo Go:** open the Expo Go app and enter `exp://<x1's Tailscale IP>:8082` (or scan the QR code `expo start` prints). The phone needs Tailscale on.

**As a real app (free Apple ID):** on the Mac with Xcode, `npx expo run:ios --device --configuration Release`, then pick my Personal Team for signing in Xcode if it asks. Apps signed this way stop opening after 7 days; running the same command again re-signs it. With a paid Apple Developer account this becomes `eas build` and TestFlight instead.

**Web preview (for checking layouts on x1):** `npx expo start --web --port 8082` plus `node scripts/preview.mjs`, then open `http://127.0.0.1:8090`. Set `API_PORT=8001` to point it at a backend running on a copy of the database, so tests never write to the real one.

## Layout

- `src/app/`: screens, one file per route (Expo Router). The four tabs share one stack definition, so an account, a category or Settings opens inside whichever tab you're in.
- `src/components/`: the building blocks: rolling digits, the scrub chart, rows, panels, the keypad.
- `src/lib/`: the API client and the money rules carried over from the web app (statement-style signs, budgets, balances, the offline outbox).
- `src/theme/`: colors, type and spacing. `DESIGN.md` says why they are what they are.
