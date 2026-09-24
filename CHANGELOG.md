# Changelog

Tally follows [semantic versioning](https://semver.org): **MAJOR.MINOR.PATCH**.
- **MAJOR** (4.0.0): a big shift, such as a redesign or a change to how your data works.
- **MINOR** (3.1.0): new features. Existing things keep working.
- **PATCH** (3.0.1): fixes and polish, no new features.

The number lives in `ios/app.json` (shown at the bottom of Settings), `ios/package.json` and `pyproject.toml`. Each
release gets a git tag (`v3.0.0`) and an entry here, newest first.

## 3.2.0 (2026-09-24)
Added
- Small animations throughout, all skipped with Reduce Motion:
  - Keypad keys pop when pressed. A digit that won't fit, or saving with no amount, shakes the figure.
  - Saving draws a check in the button, and the new entry unfolds into the lists with a brief glow. Undo brings
    deleted entries back the same way, and a deleted entry folds shut instead of vanishing.
  - A quick action's icon hops when tapped, and after saving, its amount floats up off the chip on Home.
  - A reconcile that matches to the cent draws a check and bursts confetti. So does the first look at a finished
    month that came in under budget, which also gets a badge on Insights.
  - Budget bars running ahead of their pace notch breathe a few times.
  - When net worth has gone up since you last opened Home, a band of green light sweeps across it.
  - The dot at today on the month chart breathes gently.
  - Changing theme fades the old colors off with a ripple of the new accent, and the chosen card bounces.

## 3.1.0 (2026-09-24)
Added
- Themes, in Settings → Theme. Classic is the original black and white; Aurora, Sunset, Ocean, Citrus and Blossom each
  bring a vivid accent, a tinted background, a soft glow at the top of each tab and brighter category colors. The
  choice is saved on the phone and follows light and dark mode.
- A + in the middle of the tab bar opens a new entry from any tab. It replaces the + in each tab's header.

Changed
- The tab bar stays full size instead of shrinking to one button when you scroll.
- The keypad fills in cents first, like a till: 1 5 0 reads $1.50. The decimal point key is now 00.

## 3.0.2 (2026-09-24)
Fixed
- Big rolling figures (net worth, the month's spending, the keypad amount) no longer leave gaps around narrow digits
  like 1. Each digit takes its own width and eases to the next one's as it rolls.
- The entry form fades out above the keypad instead of stopping at a hard line, and the keypad slides in and out.
- Pull to refresh only spins on the screen you pulled. A pull on one tab, or a background refresh, used to leave a
  frozen spinner at the top of the other tabs.

## 3.0.1 (2026-09-24)
Fixed
- Activity's filter, select and + buttons were missing on the phone. They sat in a React fragment, which the native
  toolbar drops in Release builds.
- Editing an entry that belongs to a split no longer unlinks it from the split.
- Editing a negative entry that isn't spending (a correction or a reversal) no longer turns it positive, and the
  settings editor keeps the minus on a negative starting balance or amount.
- A typo in a month-end balance or a budget is flagged. It used to save as $0, or clear the budget.
- Undo says so when it can't reach Tally, instead of doing nothing.
- A new entry or split is saved in one step, so a retry from the offline outbox can never add it twice or leave half a
  split behind.
- The server answers a malformed request with a reason instead of an error 500, refuses a start month that isn't a
  date (one bad value broke every screen), and refuses duplicate account and category names.
- A recurring template can post on its own day (0 days ahead), and posting ahead is capped at a year.
- The composer loads the entry being edited by its id, so old entries open and delete like new ones.
- Smaller things: "$1k" instead of "$1000" in compact amounts, a card in credit reads "credit" instead of "−$6.88
  owed", saved views keep the split filter, month-end account names fit, and dates stay right east of UTC.

Added
- The + button on Insights, so every tab can start a new entry.
- Tests: the backend went from 29 tests to 189 (routes, money and date math with Hypothesis, recurring, migrations,
  the importer, receipts, exports, outbox retries and real concurrent requests), and the app got its first 55
  (`cd ios && npm test`), plus a contract check that validates every API answer against the app's TypeScript types.

## 3.0.0 (2026-09-24)
Changed
- **Tally is an iPhone app now.** The native app I built as "Tallyho" moved into this repo under `ios/`, with its
  history, and replaced the web app. It has the Liquid Glass tab bar, native sheets and navigation, SF Symbols and
  haptics.
- The web app (the React PWA in `web/`) is retired. The server now only answers `/api` and the CSV exports. The last
  web version is in git history just before this release.

Unchanged
- The backend, the database and its rules, the address, and the nightly backups. No data moved.

## 2.1.0 (2026-09-22)
Added
- **Month in review:** for the first week of each month, Home recaps last month: left over, money in, spending
  against the month before, net worth change, the categories that moved most, and budgets kept.
- **Budget pace:** budget bars are notched at how much of the month has passed and warn "On pace to go $X over".
- **Suggested budgets:** one sheet sets every category's monthly target from its recent average.
- **Offline outbox:** new entries saved without a connection wait on the phone and sync later, never twice.
- **Backup status:** Settings shows the last nightly backup and turns red if it stops.
- **Version number** at the bottom of Settings, and this changelog.

Fixed
- Renaming the Roth IRA or Other Income category no longer breaks the Roth widget or month-end interest; both
  are picked in Settings, General.

## 2.0.1 (2026-09-22)
Fixed
- A refused delete could lock the database and make every request hang.
- Hidden categories and accounts dropped their entries from balances.
- "This month" and "today" were wrong after 6 pm (server clock was on UTC) or with future-dated entries.
- Month end, Undo after delete, recurring rules and Activity paging.

Polished
- Launch splash, native-style page transitions, clearer glass, steadier Emergency fund panel, consistent figure
  spacing, smoother scrolling on long lists.

## 2.0.0 (2026-09-21)
**Tally Glass redesign:** Apple-style look with glass on floating controls, panels on Home and Insights, a
scrubbable spending-pace chart and a spending ring.

## 1.0.0 (2026-09-21)
First full release, replacing the `money.xlsx` spreadsheet: installable iPhone app with accounts, categories, quick
actions, splits, recurring bills, budgets, receipts, reconcile, month end, Insights, saved views and CSV export, in
the "Paper Ledger" design. Merchant logos and per-merchant overrides.
