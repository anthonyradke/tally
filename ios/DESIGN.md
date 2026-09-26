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
  never the system number pad. Digits shift in from the right like a till (1 5 0 reads $1.50); 00 replaces the
  decimal point. In a new entry the keypad is the whole first screen; editing an entry, it springs up as its own
  raised panel with Done and slides back down over the save button.
- **A new entry is a few questions, one at a time.** Amount and type, what it was, category, the accounts the type
  uses, then a review with the date and Add. Tapping an answer moves on; Back and Next are always there, and dots at
  the top show where you are. Picking a past entry under "What was it?" or a quick action chip fills in what it
  knows, and Next skips those steps. The date is the past week as a row of days (entries often get caught up at the
  end of the week) plus the calendar, and "Add another" in the toast starts the next entry on the same day. A new
  entry starts empty (no guessed category or account); tapping a quick action again takes it back out. Splitting
  hands the draft to the full form. The steps move like pages in a stack: the next one slides in from the right over
  the last, Back slides it away again, each question sits at the top of its page, and the header stays "New entry".
  The dots stretch and fill as you go, Back grows in beside Next, and the full form for a split slides in as one
  more page.
- **Swipe rows like Mail (iOS 26).** Right: Duplicate. Left: Category, Edit, Delete. The actions come up as circles
  that grow with the swipe; keep going and the edge one (Duplicate, Delete) stretches into a capsule with a tick, and
  letting go runs it (Delete slides the row away, then it folds shut). A half swipe rests open; tapping the row,
  swiping another or scrolling closes it. Long press has the same actions in a menu, lifted as a rounded rectangle.

## Structure
- Native tab bar (Liquid Glass on iOS 26): Home, Activity, +, Accounts, Insights. It stays full size (never
  minimizes on scroll). The + in the middle opens the composer from anywhere; it's the only way in, so tab headers carry
  no + of their own. Tabs are peers; re-tapping one pops to its root. Settings is a gear on Home.
- Each tab is a native stack with a large title. Detail screens (account, category, month end, settings) push.
- Adding an entry is a modal of short steps; editing one is a modal form with its own close and save. Short choices (category, account, date, bulk
  actions, filters, reconcile) are form sheets with a grabber. Nothing uses a confirm dialog: deletes happen and
  offer Undo.

## Color
- Themes (Settings → Theme, stored on the phone; palettes in `src/theme/themes.ts`). **Classic** is the original:
  Apple's system grouped palette (`#F2F2F7` / true black; panels white / `#1C1C1E`) with black/white ink.
  **Aurora, Sunset, Ocean, Citrus, Blossom** each wash the background in their hue, put two soft pools of color
  (the glow) behind the top of each tab, and use one vivid accent.
- **Ink is the only accent**: the theme's accent (black/white in Classic). Primary buttons, selected chips, the tab
  bar's +, checkmarks and the chart line. The tab bar tints with it too. The + images are drawn per theme by
  `scripts/tab-icons.mjs`; rerun it after changing an ink.
- One semantic pair, green and red, for money direction only, the same in every theme.
- Category tints: Classic keeps the retired web app's validated eight-hue ring (converted from OKLCH exactly); the
  other themes use the same eight hues at full chroma. Both have a cool grey. Bank marks use each bank's own color.

## Type
- SF Pro (system). Hero 44/700 with tight tracking, titles 28 and 22, body 17, rows 16/500, captions 13 and 12.
- Every amount in a list uses tabular figures so columns line up. No all-caps labels, no "A · B" strings.

## Shape and space
- Panels 24 with continuous corners, inputs 12, actions and chips are pills, marks are circles.
- 4-point rhythm: 8 to 12 inside a panel, 28 between sections, 16 screen margins.

## Motion
- Navigation, sheets and the tab bar are the system's own.
- Nothing inside a screen snaps. Content that replaces a loading skeleton fades up; a new filter or search keeps the
  current list until its results land; switching months in Insights eases the month in from the side it came from
  while its figures roll; trend charts draw in from the left once when they appear; toasts sink and fade when they
  go; a switch or tick in Settings moves on tap and the save follows. The Back / Next bar in a new entry rides the
  keyboard on the keyboard's own timing.
- Rolling digits for figures that change (hero numbers, the keypad, month switches). Bars, rings and the donut draw
  once when they appear. Toasts slide up from the tab bar; swipe one down to put it away.
- Scrubbing runs on the UI thread (Reanimated worklets); a selection tick marks each day passed.
- Press feedback runs on the UI thread: buttons and cards spring to 0.97, list rows highlight after a beat (so a
  scroll doesn't flash them) and the highlight fades on release. Select mode slides a check circle into every row at
  once. Reduce Motion turns rolls and draws into instant changes, and skips the moments below.
- Small moments, each once and short (the pieces live in `components/`: CheckDraw, Confetti, Sheen, Shake,
  ThemeWash; the state that triggers them in `lib/motion.ts`):
  - Keypad labels pop on each press; a digit that won't fit, or saving $0, shakes the amount.
  - Saving draws a check in the button before the sheet closes. The new rows unfold into the lists with a brief glow
    in the accent; rows brought back by Undo do the same, and a deleted row folds shut before it goes.
  - A quick action's mark hops when tapped, and once saved its amount floats up off the chip on Home.
  - Reconcile to the cent draws its check and bursts confetti; so does the first look at a finished month that came
    in under budget (Insights badge; early in a month, a pill points back to it).
  - A budget bar ahead of its pace notch breathes three times after it fills.
  - Net worth higher than when Home last showed it: a band of green light sweeps across the figure.
  - The month chart's end dot (today) breathes while the chart is at rest.
  - Changing theme fades the old background off and spreads a ripple of the new accent from the tapped card.

## Haptics
Selection ticks on the keypad, chips and scrubbing; success on save, reconcile and an under-budget month; warning when
an entry is saved offline; error when a save is refused or a keypad digit won't fit; a light tap for the tab bar's +
and a theme change.

## Open questions
- Car and Entertainment share the blue tint, and Dining Out and Pets share orange. Worth giving one of each pair a
  different default.
- Net worth history only has month-end points; a daily line would need investment balances between month ends.
