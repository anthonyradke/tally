# Design: Tally for iPhone

**Date:** 2026-09-23. **Goal:** feel like a first-party iOS finance app that happens to know my money: the grammar of
the top-grossing finance apps (Apple Card and Wallet, Copilot, Monarch, Robinhood, Cash App), built from native parts.
Changes to anything below get written here first.

## What the category agrees on (and this app does)
- **One number first.** Every root screen opens on a single large figure (net worth, this month's spending, a
  balance) with its change underneath in green or red. Everything else is supporting detail.
- **Charts you can touch.** Trend lines have no axes; dragging reads a day, and the figure above follows the finger.
  Past the finger the line dims. Releasing goes back to now.
- **Merchants, not rows.** Every entry leads with a round mark: the brand's own glyph where one exists, a
  brand-colored monogram otherwise, the category symbol as a fallback. Category symbols sit white on a solid tint.
- **Grouped by day, inset panels.** Activity reads like a statement: day headers with the day's spending, entries on
  rounded panels, the account under each amount.
- **Budgets as bars with a pace notch.** The notch marks how much of the month has gone by; a bar past its notch is
  on pace to go over, and says by how much.
- **A keypad for money.** Entering an amount is a full-width keypad with the figure rolling as you type (Cash App),
  never the system number pad.

## Structure
- Native tab bar (Liquid Glass on iOS 26): Home, Activity, Accounts, Insights. Tabs are peers; re-tapping one pops to
  its root. Settings is a gear on Home.
- Each tab is a native stack with a large title. Detail screens (account, category, month end, settings) push.
- Adding or editing an entry is a modal with its own close and save. Short choices (category, account, date, bulk
  actions, filters, reconcile) are form sheets with a grabber. Nothing uses a confirm dialog: deletes happen and
  offer Undo.

## Color
- Neutrals are Apple's system grouped palette (`#F2F2F7` / true black; panels white / `#1C1C1E`). One cool grey
  family.
- **Ink is the only accent**: black in light, white in dark. Primary buttons, selected chips, the prominent + and
  the chart line. The tab bar tints with it too.
- One semantic pair, green and red, for money direction only.
- Category tints are the retired web app's validated eight-hue ring (converted from OKLCH exactly), plus a cool grey. Bank
  marks use each bank's own color.

## Type
- SF Pro (system). Hero 44/700 with tight tracking, titles 28 and 22, body 17, rows 16/500, captions 13 and 12.
- Every amount in a list uses tabular figures so columns line up. No all-caps labels, no "A · B" strings.

## Shape and space
- Panels 24 with continuous corners, inputs 12, actions and chips are pills, marks are circles.
- 4-point rhythm: 8 to 12 inside a panel, 28 between sections, 16 screen margins.

## Motion
- Navigation, sheets and the tab bar are the system's own.
- Rolling digits for figures that change (hero numbers, the keypad, month switches). Bars, rings and the donut draw
  once when they appear. Toasts slide up from the tab bar.
- Scrubbing runs on the UI thread (Reanimated worklets); a selection tick marks each day passed.
- Press feedback: buttons and cards scale to 0.97, list rows highlight. Reduce Motion turns rolls and draws into
  instant changes.

## Haptics
Selection ticks on the keypad, chips and scrubbing; success on save and reconcile; warning when an entry is saved
offline; error when a save is refused.

## Open questions
- Car and Entertainment share the blue tint, and Dining Out and Pets share orange. Worth giving one of each pair a
  different default.
- Net worth history only has month-end points; a daily line would need investment balances between month ends.
