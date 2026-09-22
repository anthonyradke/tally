# Changelog

Tally follows [semantic versioning](https://semver.org): **MAJOR.MINOR.PATCH**.
- **MAJOR** (3.0.0): a big shift, such as a redesign or a change to how your data works.
- **MINOR** (2.2.0): new features. Existing things keep working.
- **PATCH** (2.1.1): fixes and polish, no new features.

The number lives in `web/package.json` (shown at the bottom of Settings) and `pyproject.toml`. Each release gets a git
tag (`v2.1.0`) and an entry here, newest first.

## Unreleased
- Reorderable lists (categories, quick actions, Edit Home) now scroll normally. Only the grip handle on the left drags a row.
- The tab bar no longer floats partway up the screen after typing in a search box or field. It tucks away only while the keyboard is on screen and returns once it has closed.
- Rows in Settings and Accounts no longer stay highlighted when you swipe back to the list.

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
