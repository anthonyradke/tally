# Changelog

Tally follows [semantic versioning](https://semver.org): **MAJOR.MINOR.PATCH**.
- **MAJOR** (4.0.0): a big shift, such as a redesign or a change to how your data works.
- **MINOR** (3.1.0): new features. Existing things keep working.
- **PATCH** (3.0.1): fixes and polish, no new features.

The number lives in `ios/app.json` (shown at the bottom of Settings), `ios/package.json` and `pyproject.toml`. Each
release gets a git tag (`v3.0.0`) and an entry here, newest first.

## 4.1.0 (2026-11-25)
Added
- Insights tab: spending or income by day for a month, or by month for six months, a year or everything, read like
  Health's trends. Swipe the chart to page back in time, tap or press along the bars to read one, a dashed line marks
  the average, a highlight compares the latest month with the usual, and each category shows its share and change
  from the period before. A category opens to its own months and entries.
- On a ledger built from the banks, a bank connected later brings its accounts in as setup would (named after the
  bank's, held at its balance, all history), including loans such as a student loan servicer.

## 4.0.1 (2026-11-25)
Changed
- Face ID is iOS's own app lock (touch and hold Tally's icon, Require Face ID); Tally's in-app lock and its
  `expo-local-authentication` module are removed. The app-switcher cover stays.
- Changing the server address or token in Settings clears what the app has loaded, so one server's figures never
  show for another.

## 4.0.0 (2026-11-25)
A new app design and bank sync. The previous design and its screens are removed; its last version is 3.7.0.

Added
- Bank sync through Plaid (off unless Plaid keys are configured). Bank rows live in their own `bank.db`, pair with
  existing entries, and the rest get a guess at name, category and accounts learned from paired entries, card
  payments paired across both accounts, then Plaid's category. Rows Tally is sure of are added on their own, and
  each account is held at the bank's balance.
- Plaid's webhook (`PLAID_WEBHOOK_URL`): new transactions sync minutes after Plaid has them. Each message must carry
  Plaid's ES256 signature over its body and the URL's secret; existing connections are pointed at the URL on start.
  The server also checks every four hours (`TALLY_BANK_SYNC_HOURS`) and on app open after half an hour.
- First-time setup for an empty ledger: connect banks (several in one Plaid Link session where Plaid allows it),
  review the accounts Tally proposes, choose all history or this month, and Tally creates the accounts, a starter set
  of categories and the entries it's sure of.
- The check-in opens on the first open of the day and when new rows arrive: rows to review (swipe right to add,
  left to skip, or pick a category and account), new bank accounts to place, and the week's automatic additions.
- A new design on Apple's system colors, text styles and controls: Summary, Activity, Accounts, entry pages, Add,
  the check-in and Settings, with merchant and bank logos (`/api/logo`), Tally's own emerald tint, critically damped
  motion, numbers that change like SwiftUI's numeric text and haptics throughout.
- Summary's rings: spending against the budget (or last month) and the share of the month gone.
- Accounts stacks cards and bank accounts like Wallet in their banks' colors, or as a picture of the real card
  (`/api/accounts/{id}/art`, `/api/cards`), and a card zooms open into its account page.
- An entry's page is washed in the merchant's brand color (`/api/logo/color`).
- Activity's switcher swipes to the first or last filter as in Mail and answers before the list redraws; holding
  delete on the keypad keeps deleting.
- Settings: App Icon picker; the app-switcher and Face ID cover is the system blur with the current icon.

Changed
- The glowing t is the default app icon.
- Plaid's salary income maps to Paycheck.

Removed
- The previous design: Home, Insights, Catch up, budgets and goals editing, recurring entries, reconciliation,
  themes, sounds and the second server (Tally Lab) setting. The server routes behind them are unchanged.

## 3.7.0 (2026-11-22)
A pass over how the app feels in daily use, from reviewers using it the way it gets used: logging single purchases,
the weekly catch-up, finding and fixing old entries, checking where money stands, and keeping settings up.

Added
- Tags show on entries, the long-press menu lists every entry with one, and the editor, new entries, Filters and
  bulk tagging suggest tags already in use.
- Select mode has Select all (including entries not loaded yet), shows the selection's total, and can move entries
  to another account, with Undo.
- Catch up: "Bank says the same" reconciles the account in one tap once its entries are in, with Undo. "N added"
  opens the session's entries to fix or delete one, and Undo on the last entry reopens it filled in.
- Reconcile: a gap offers to add the missing entry and lists the entries since the last match to tick off.
- Home and Insights say in one line whether the month is on track against its budgets.
- Any entry can start a recurring entry or a quick action from its menu; a scheduled bill shows which recurring
  entry it came from.
- Pause, resume and skip a recurring bill in one tap, from its page or by swiping it in Settings; Skip names the date.
- Budgets can be set for this month or next as a one-off.
- Settings has Export (CSV) and Month end; account and category pages have an Edit button; Accounts and Insights
  have the settings gear; Quick add has Edit and New; Coming up links to Recurring; Home ends with Customize Home.
- A place's logo picker opens from its mark and has a brand search.
- Activity filtered to one cash account or card shows each day's closing balance, and signs rows the way the
  bank's statement does, so it can be checked line by line.
- A search with no matches says when Recently deleted has some. The saved view that's on is named in the pill row,
  and tapping it brings the view back after a change.
- Catch up's Home suggestion can be turned off per account, with Undo.

Changed
- New entries: a quick action tapped after typing an amount keeps the amount; Next goes straight to the review once
  everything after it is filled in, and a page opened from the review says Done; a past place typed in full and
  Return fills in its category and account; "What was it?" finds past entries of every type and switches the type.
- A quick action that only names a category (Gas, Groceries) leaves the place for you and lists that category's
  usual places first.
- An amount already on the keypad shows selected, and the first digit replaces it, in new entries, the editor and
  Catch up.
- Refunds read as refunds (a green +amount, "Add refund", "Refunded … to Shopping"); income shows green with a +.
- Tap the "Added…" message to open the entry just saved. It names the day when that isn't today; the delete
  message names the amount.
- The editor picks dates from the same row of days as a new entry. Splitting fills line 1 with what's left, and a
  new line goes on to its category after its amount.
- Closing an editor with unsaved changes offers them back with Restore (never a confirm dialog). Money fields have
  a Done key; budgets save when you go Back.
- Catch up starts each account on the day of its newest entry, fills in a past place's last amount as a
  suggestion, offers "Skip, it's already in" for a lookalike, picks the right direction for a card payment, shows
  running balances, and marks this session's entries. Home also suggests catching up an account that has never
  been caught up.
- Search ignores punctuation ("trader joes" finds Trader Joe's), takes today, yesterday, this or last week and this
  or last month, and matches amounts properly (9.01 finds only $9.01; exact amounts come first).
- Saved views keep "Last month" or "This year" by name so they move with the calendar; the view that's on is ticked,
  with Update. The Filters sheet shows the search and type, Reset clears everything, and Recently deleted is linked.
- Filters with no lit chip show as removable pills above the list. Activity opened from another screen starts from
  cleared filters, and scrolls to the top after a filter change.
- A category opened from a past month in Insights shows that month, its places and entries.
- Net worth shows its change since last month everywhere it appears. The emergency fund says how many months of
  spending it covers and opens its account.
- Next 30 days and Coming up are one section; scheduled lists say "Scheduled" and "due"; card lines say what's owed.
- The month story leaves bills out of its highlights and names the budgets that were missed; left over is described
  correctly (money in less spending).
- The day-by-day calendar shades everyday spending and marks bill days with a dot; Trends always use percentages;
  the Every month table shows whole dollars and picks a month when tapped. Paid bills say "Paid".
- Recurring bills show and edit the next date that will actually happen; moving it posts them from the new day and
  says so, with Undo.
- Hiding an account says what still posts to it and can move those quick actions and recurring bills; pickers show
  a hidden account as "Name (hidden)", and a hidden account that still holds money stays on Accounts.
- The account form puts name, type and balances first, with the look under one Appearance row; the starting
  balance names the day it applies to. Recently deleted names what it put back and can put back a whole bulk delete.
- The Home suggestion to catch up follows each account's own pace and leaves alone accounts that see only a few
  entries a month.
- Catch up names a skipped lookalike, shows "Missing $10.00 from Reconcile" when it came from a gap, keeps the
  "after it" balance current, puts the most used spending first for a new name, and counts this session's and
  waiting entries as lookalikes.
- Delete on a selected amount clears it. Tag suggestions show while the tag field is in use. The row's tag is a
  label on the phone; the long-press menu lists that tag's entries.
- A split saved from the form gets the same "Added" message, and tapping it shows the split's lines.
- Hand-typed monthly bills (a utility typed each month) count as bills in the story, the calendar and the month in
  review. Home's scheduled total matches the upcoming list.
- A category page opened on a past month rests its chart on that month.
- Recently deleted labels a skipped recurring date ("Skipped from Rent") with Unskip. Hiding an account only offers
  accounts that fit as the new home for its quick actions and bills, and a suggestion on a hidden account picks a
  shown one. The category page's budget editor has this month and next.

Fixed
- Moving a recurring bill's next date could delete bills already scheduled.
- Catch up kept the last entry's amount and category after going Back, which could turn $60 into $9,000,060.00.
- A card payment entered on the card counted as money leaving it.
- Home's Recent "See all" could open Activity with an old search still on.
- Saved views kept fixed dates and a hidden search.
- Putting back a skipped recurring date from Recently deleted after unskipping it posted the bill twice; a date
  that's already posted is now refused.
- Opening an entry from a screen with a draft in progress (Catch up, a new entry) could replace that draft when
  the editor closed.

## 3.6.2 (2026-11-20)
Fixed
- A refund can be typed on the new entry keypad again: − and then the amount (or a sum that comes out below zero)
  saves as a refund instead of shaking. The figure shows the − for a refund.
- Receipt uploads are checked by their contents, not only by the type the phone says they are: a file that isn't
  really the JPEG, PNG, WebP, HEIC or PDF it claims to be is refused, and the receipt already attached stays.
- Statement matching read a bank export with "Debit Amount" and "Credit Amount" columns as one amount column, so
  every credit was left out and every debit counted as money in. Both columns count now.
- Statement matching takes exports with no header row (Wells Fargo's CSV: date, amount, then the description).

## 3.6.1 (2026-11-13)
Fixed
- Tally opened Safari instead of itself at launch. A plain launch was held as a link for after Face ID unlock, and
  that link (`//`) opened as `https://`.

## 3.6.0 (2026-11-12)
Added
- Recently deleted, in Settings: entries deleted in the last 30 days, each with Put back, for when the Undo toast
  has gone or the app was closed. A put-back entry keeps its receipt and its place.
- Skip one date of a recurring entry, in the template's settings, without changing the template. A skip can be
  taken back.
- Reconcile can match a statement CSV exported from the bank's site: each line is paired with an entry, and what's
  on one but not the other is listed. A line missing from Tally opens a new entry filled in from the statement.
- Catch up shows the account's balance after each line, to check against the bank's running balance, says when the
  account was last caught up, and links to reconcile. Home points out an account not caught up for nine days.
- Activity lists the entries waiting to send, dimmed, with the reason when Tally refused one.
- Settings shows the off-site backup next to the server's own, a warning if the server's database check fails, and
  the server's version when it differs from the app's.
- A login for the server. When it's set up, every request needs a token, typed once in Settings > Server and kept
  in the phone's keychain; a wrong token is reported there instead of looking like Tally is down. Receipt photos
  send it too. The server's API documentation pages are no longer served.
- Settings > Activity filters (also reachable from the Filters sheet) picks which chip rows sit above Activity's
  list (type, accounts, dates, categories, sort), their order, and which chips each row offers. Every row's chips
  can be reordered; account and category chips start in their Settings order.
- Accounts can show their bank's logo: Chase, Amex, SoFi, Wells Fargo, X Money, Schwab, Empower, Alight and
  MOHELA. Accounts set to the Chase, Amex, SoFi or Wells Fargo bank color show it on their own; the rest are picked
  under Logo in the account's settings. A small badge marks cards and interest-earning savings, so two accounts at
  one bank tell apart.
- Catch up, for adding a week's entries at once. It opens from the button next to Activity's filters, from an
  account's page, or from the top of a new entry. Pick an account and it shows that account's newest entries in
  Tally, which is where to resume in the bank's app. Each entry asks only for the name and the amount: the account
  stays the same, the day carries over to the next entry, and the account's usual places and categories come first.
  Add saves straight away and starts the next one, with Undo for the last. An entry for the same amount on the
  account within three days is pointed out in case it's already in Tally (a card payment entered from the checking
  side, a scheduled bill).

Changed
- Coming back to Tally refreshes what's on screen. It used to stay as it was until a screen opened.
- CSV exports open the share sheet (Files, AirDrop, Numbers) and work with the login on. Excel reads accented names
  correctly, and a name starting with = or + stays text.
- Search waits for a pause in typing.
- Entries Tally refused wait for Send now instead of being sent again every 20 seconds. A wrong token keeps every
  entry waiting instead of marking them refused.
- Settings > Server checks a new address and token before switching to them, adds https:// when it's missing and
  drops a trailing /api.
- The 90 days and This year chips leave out scheduled entries.
- A link into Tally (a Wallet automation) waits while Tally is locked and opens after Face ID.
- Accounts, categories, quick actions and Activity's filter rows and chips in Settings reorder by dragging: hold a
  row (or grab its handle in reorder mode) and drop it where it goes, instead of stepping it with up and down
  buttons. Holding it near the top or bottom of the screen scrolls the page along.
- The account chips in Activity have their own row under the types, starting with "Any account", instead of
  hiding at the far end of the type row. Both rows scroll to keep the picked chip in view.
- Tapping + while Activity is filtered to one account starts the new entry on that account, as an account's own
  page already did. Switching the entry to Income moves that account to the To side instead of dropping it.
- A month's Spent counts what has happened: entries scheduled later in the month (a recurring bill) join it on
  their day. Home, Insights, the story, budgets and net worth now agree with each other.
- Left over is money in less spending, everywhere. Home's big figure is the same number ("Up in November" used to
  take off loan payments, while Left over under it also took off savings).
- Trends and the budget pace compare a month still going with what the months before had spent by the same day.
  Rent paid on the 1st no longer reads +650% or "on pace to go $7,000 over". Big jumps show as 4.1× instead of a
  four-digit percent.
- Search matches every word anywhere in an entry: "trader groceries" finds Trader Joe's in Groceries. "-5" finds
  refunds of $5.
- Links into Activity (See all, a place, an account's entries, a day) start from cleared filters, and the Activity
  tab gets its own filters back afterward.
- Bulk moves and swiping to Category only offer categories the entries fit.
- Transfers show From → To under the name instead of squeezing both. An account's own rows say "To Chase" instead of
  repeating its name.
- Categories without a color of their own get one from their name (Rent, Dining out, Utilities were all grey and
  looked like the empty track in bars and the donut).
- The Home screen layout in Settings reorders by dragging, like the other lists.
- "Use suggestions" in Budgets only fills categories with no budget yet, and can be undone.
- Settings > Server only keeps a new address once Tally answers there ("Use it anyway" for a server that's down).
- Settings > Goals has a None choice for Roth contributions and month-end interest.
- Recurring costs' share of income uses a typical month, not an average one big deposit pulls up.
- Day by day's weekday line covers the 12 weeks up to the month on screen and leaves out recurring bills and each
  weekday's one biggest day.
- The month story compares a month still going with the month before up to the same day.

Fixed
- New entries default to today on the phone. After a night in the background, or offline, they took the day of the
  last refresh, usually yesterday, with Today marked on the wrong day.
- Editing an entry after a bulk move or tag no longer puts its old category and tags back.
- Undo for a delete works after another entry was added in between. It used to say "That entry is already back" and
  the entry was lost.
- Month end keeps what was typed in one section when another is saved (the suggested interest came back, and Log
  interest logged it).
- Opening a new entry over the editor (Add another from the toast, a link) no longer saves the new one over the
  entry being edited. A second Wallet link while a new entry is open starts over with the new amount.
- A double tap no longer sends twice: Add, Save, bulk move and tag, deleting a recurring template, Catch up's Undo,
  saving a view. A sheet swiped down while saving no longer closes the screen under it too.
- A recurring template changed from weekly to monthly keeps the day it now starts on. It posted two charges days
  apart, then fell on the 1st.
- Editing a recurring template keeps a scheduled entry moved to another day by hand, and doesn't bring back one
  that was deleted.
- Large receipt photos upload when the server's temporary space is low, and the server reads no more than 12 MB.
- Settings > Backups warns when no snapshot is found. It showed "None found" with no warning while the server
  couldn't see its backups folder.
- Month end no longer asks for an investment that hasn't opened yet. Deleting the interest or Roth category switches
  that setting off (it passed to the next category made). An account with only saved reconciliations can be deleted.
- The server answers with a message instead of failing on a month far outside the ledger, huge numbers and ids, long
  tags and bodies that aren't JSON. A restored entry is checked against its category's rules.
- The first month's emergency fund goal no longer drops when scheduled entries add months after it.
- A waiting entry discarded while others are sending isn't sent. An error page from a proxy counts as unreachable,
  not as Tally refusing the entry.
- VoiceOver: toasts no longer trap it and are read out, and charts step through their values with a swipe up or
  down. Big rolling figures don't clip at large text sizes. The keyboard no longer covers Month end's and Budgets'
  lower fields. The app-switcher cover appears at once, so the snapshot doesn't catch the screen.
- Typing a name, note or tags no longer sometimes jumps the cursor to the front of the field mid-word ("McD" turning
  into "onaldsMcD").
- Header buttons answer the first tap. Catch up and the other buttons on Activity, and the X on Catch up, the
  composer and the editors, sometimes took a few tries or did nothing, because the header rebuilt its buttons
  whenever the screen redrew (Activity on every refresh, the composer on every key).
- Next in a new entry always goes to the next page. It used to jump past steps that already had an answer, so after a
  quick action or going back it could leap from the amount straight to the accounts.
- A saved view or link pointing at a deleted account no longer filters Activity to nothing with no chip lit, and
  an archived account picked that way shows in the Filters sheet too.
- Picking a past name while typing "What was it?" keeps the full name. Now and then the text typed so far ("Mc")
  came back over it on the next page.
- Changing Activity's filters no longer jumps the list down into the log. When the new results still held the
  entry at the top of the screen further down, the list scrolled to keep it in view.
- A new recurring template's "Shows as" follows the label as you type it (it kept the first letter: "N" for Netflix).
- Changing a recurring template's or quick action's category to another type clears the account it no longer uses,
  so saving doesn't fail on a row that isn't shown.
- Reconcile can check a $0.00 balance, and its likely causes show dates like "Tue, Dec 1".
- An account's type can't change while it has entries or month-end balances (it flipped every balance), and names
  that only differ in case are refused.
- Bulk tags split on commas as well as spaces (typing "trip, gift" made a tag "trip,").
- Bulk move, bulk tag, and deleting a recurring template (its future entries too), a quick action or a saved view
  can all be undone.
- A receipt that fails to upload is said in the "Added" toast instead of a toast that disappeared at once.
- "What was it?" and Catch up suggest from what has happened, not bills scheduled weeks ahead.
- Add another keeps the account the entry was started from.
- Month end logs interest once per account and month, its buttons wait for the save, and investments show the
  balance they carry in grey.
- A loan's page says its balance includes this month's interest.
- The recurring list shows when each one is next due (Rent read "next Jan 1" with December already posted), and
  "tomorrow" instead of "next Tomorrow".
- The amount on a new entry no longer jumps when a sum starts, and Category lines up with What and From.
- The Filters sheet's Tag field keeps what's typed (a # couldn't be typed) and lists a hidden category that's being
  filtered.
- The API refuses an APY over 100% or below 0, negative budgets and Roth limits, budgets on non-spending
  categories, and very long text. Deleting entries that are already gone says so.

## 3.5.0 (2026-10-12)
Added
- A loan's page has a Payoff section: when it will be paid off at the rate you're paying it (your recurring payment,
  or your average over the last few months), how much interest is still to come, and what $25 to $100 more a month
  would save.
- Little moments on Home, each once: "Payday!" when money in of $200 or more lands today, and a milestone when net
  worth passes a round $5,000 on the way up ("out of the red" at zero). Confetti, the till's ring, tap to put away.
- Lock with Face ID (Settings, off unless you turn it on): Tally asks when it opens and when you come back after a
  minute away. Whether it's on or not, Tally is blurred in the app switcher. (Needs the rebuild.)
- Two new themes: Forest (deep green) and Midnight (navy and gold in the dark, warm gold on paper in the light), each
  with its own glowing t in Settings → App icon (the icons need the rebuild).
- The keypad in a new entry adds up: + and − above it start a sum ("12.50 + 4.25 − 1.00" under the figure, the total
  in it), and Next or = takes the total. For a receipt with a few items, or a bill split with someone.
- Recurring costs in Insights: what every bill and subscription adds up to a month and a year, and roughly what share
  of your usual income that is, with one bar split by bill. Settings → Recurring shows the same total under its list.
- An account can have its own symbol and color (Settings → Accounts → the account), like a car for a car loan. The
  bank's color stays the default.
- The emergency fund card on Home says when it reaches the goal at the pace it has grown over the last few months
  ("At +$400 a month, there by September 2027").
- A loan's Payoff has "What if you paid some now": drag to try a one-time payment (a bonus, or money from selling
  something) and see the new payoff month and the interest it saves. For a loan with no payments yet, it shows what
  would be left and the interest it would add each month.
- Search in Activity takes shortcuts: `>50` or `<=20` for amounts, a month like `aug` or `aug 2025`, and `#trip` for
  a tag. They mix with words, so `coffee >5 aug` works.
- Settings → Recurring suggests templates for entries that repeat on a steady schedule at the same amount (a
  subscription, rent, a paycheck). Tapping one opens the editor filled in; the X hides it.
- Month end: empty a loan or investment balance and save to take it back out, so a loan goes back to Tally's own
  figure.
- Pages for places: long-press an entry and pick "All at Chipotle", or tap one under Top places in Insights, to see
  everything spent there, how many times, the average, the month-by-month line and its entries. Its logo can be
  changed there too: a brand, a letter on a color, or the category's symbol.
- Trends in Insights: your biggest spending categories as small cards, each with its line over the last months and
  how the month compares with its usual (scaled to the day for the month in progress).
- Add from Wallet: a link like `tally://new?amount=6.50&what=Starbucks&card=Amex` opens a new entry filled in, with the
  category and account from your last visit to that place, often straight on the review step. Settings → Add from
  Wallet shows how to have an iOS Shortcuts automation open it every time you tap to pay.
- Searching Activity for a place shows a card that opens its page, and each category's page lists its top places.
- Top places in Insights: the five places that took the most that month.
- Day by day in Insights: the month as a calendar, each day shaded by how much went out (scheduled days get a dot).
  Tap a day for its total, tap again for its entries in Activity. Under it: how many days went by without spending,
  and which day of the week tends to cost the most.
- Month stories: a full-screen recap of a month, one page at a time like stories in a social app. What came in and
  went out, how much you kept, where most of it went, your biggest day, your regular place, quiet days on a little
  calendar, how it compares with the month before, net worth and budgets kept. Tap through, hold to pause, swipe down
  to close. Play one from the month in review on Home or from any month in Insights (the month in progress plays
  "so far").
- Next 30 days on Home: each cash account and card with something scheduled (recurring bills, future-dated entries),
  with a small line of where it's headed and its balance a month out. A cash account that would dip below zero says
  on which day, in red. The account's own chart carries on past today as a dashed line. It can be moved or hidden
  in Settings → Home screen.
- Sounds, quiet ones under the haptics: a soft tock on the keypad, two rising marimba notes when an entry is added, a
  till's "cha-ching" for money in, a breath for a delete and its reverse for Undo, glass bells for a reconcile that
  matches or a month under budget, and a low double knock when something's refused. They follow the silent switch,
  mix with music, and Settings → Sounds turns them off. (Needs a rebuild of the app; before that it stays silent.)
- Hide amounts: the eye next to Settings on Home (or Settings → Hide amounts) turns every figure into $•••, charts
  and scrubbing included, until you switch it back. The keypad screens still show what you type.
- Activity's chips go on past the types with one per account (in Settings' order, with its mark): tap one to see
  only that account's entries, tap it again to let it go. It works alongside a type, so spending on one card is two taps.

Changed
- Home's large title says hello for the time of day ("Good morning", "Up late"). The tab is still Home.
- Saving a recurring template updates the entries it already scheduled ahead: a new amount, category or account
  reaches them, and moving its date no longer posts a second entry next to the old one. Pausing takes its scheduled
  entries out. Entries dated today or earlier, and scheduled ones you changed by hand, stay as they are.
- Activity folds entries scheduled for later into one "5 scheduled" row at the top, so the list opens on what has
  happened. Tap it to show them; a date filter or Upcoming lists them as before.
- A category's type can't be changed while entries or recurring templates in it don't fit the new type (spending
  turned into Money in would have counted every purchase as income). Move them first, or make a new category.
- "This month" in Activity's filters stops at the end of the month instead of taking in next month's scheduled
  entries.

Fixed
- Dividers were drawn 1.5 pixels tall and rounded to 1 or 2 depending on where they landed, so some all but vanished
  (under Account in Activity's filters) and came back when something above moved. They're a steady 2 pixels now.
- Next in a new entry could jump from the name straight to the review, past a category or account you'd looked at
  but not picked (after going back, or tapping Next twice). Next now waits on a step that needs an answer.
- A credit card's page had Paid off and Charged the wrong way round.
- Coming up on Home could be empty on a busy day: today's entries took its places.
- Activity opened from Coming up didn't light the Upcoming chip and also listed today's entries.
- Insights could stay on last month after the app opened on a new month, until you left and came back.
- A new entry opened before anything had loaded lost the quick action or account it was opened from.
- A budget typed as "1.2.3" in Settings → Budgets was saved as $0; it now says to check it.
- Settings → Server showed an entry waiting to send as saved tomorrow if it was saved in the evening.
- Leaving the Roth limit field saved it and said "Saved" even when nothing changed.
- Switching a loan or investment to cash or card clears its opening month, and the emergency fund goal stays between
  1 and 24 months.
- One entry with a mistyped year (like 9999) stopped every screen from loading. Dates more than ten years out are
  refused now.
- An entry dated before the month Tally starts counting from vanished from every balance without a word. It's refused
  with the reason, and the calendars grey out those days. Recurring templates can't start before it either (they'd
  post a backlog that counts nowhere), and the start month can't be in the future.
- Insights compared this month so far with all of last month ("−$1,446 vs Sep" on the 8th). It now compares the same
  days ("+$154 vs Sep 1–8").
- A loan or investment opened this month showed its whole balance as a change since last month on Accounts.
- Reconcile can take a balance below zero (a card in credit, an overdrawn account).
- Bank colors typed with a capital ("Chase") showed grey.
- Net worth charts called the month in progress "End of October"; it's "October so far".
- "Send now" for entries waiting on the phone said "Still unreachable" when Tally had refused them.
- The APY under a savings account wrapped onto two lines next to the Emergency fund tag.
- A rolling figure measured while its screen was hidden could cache zero-width digits and show "$." from then on.

Developer
- `expo-audio` and `expo-local-authentication` are new (native modules, so Tally Dev needs a rebuild; `app.json`
  gained the Face ID permission text). The sounds are drawn by
  `ios/scripts/sounds.mjs` into `ios/assets/sounds/`.

## 3.4.0 (2026-10-05)
Added
- Wells Fargo as a bank color for accounts.
- Month end has an optional Loan balances section: type the balance from a loan's statement and Tally uses it for
  that month and carries on from there, instead of its own interest estimate.
- A loan or investment can have an opening month (Settings, the account, Opened). Before that month it counts as
  nothing: no balance, no interest, and earlier months' net worth stays as it was.
- A launch animation: the t writes itself, glows and lifts away to show the app. It takes the colors of the app icon
  you picked, or of your theme if you kept the app's own icon.

Changed
- Home opens on how far ahead you are this month (money in, less spending and loan payments) instead of net worth.
  Tap the figure to swap to net worth and back. Net worth is still the figure at the top of Accounts.
- Switching months in Insights slides the old month out and the new one in, and the sections below glide to their
  new place instead of jumping.

Fixed
- The old tally-marks logo no longer shows while the app opens.
- Next on the first step of a new entry was narrower than it should be; it now fills the row.
- Reconcile shows the amount as you type it.
- The highlight on a pressed row fills the rounded corners of its box (Accounts, Home, Insights, account and
  category pages), like Activity.

## 3.3.0 (2026-10-01)
Added
- Adding an entry is now a few quick steps instead of one long form: the amount and type on a full-screen keypad,
  then what it was, the category and the account, and a review with Add. Tapping a choice moves on by itself, and
  Back and Next are always there. Picking a past entry under "What was it?" fills in its category and account and
  skips ahead, and so does a quick action.
- The date in a new entry is this past week as a row of days, with the calendar a tap away, and "Add another" in the
  toast starts the next entry on the same day, for catching up on a week at once.
- Swipe actions on every entry, like Mail on iOS 26. Swipe left for Category, Edit and Delete, right for Duplicate.
  The actions appear as circles that grow as you swipe; keep going and the last one stretches into a pill with a
  haptic tick, and letting go runs it. A half swipe rests open, and tapping the row, swiping another one or
  scrolling closes it. Deleting slides the row away, and Undo brings it back.
- Long press on an entry also has "Change category", and the lifted row now keeps its rounded corners.
- The + on an account's page starts the new entry from that account.
- Swipe the Undo toast down to put it away.
- The emergency fund and Roth cards on Home open something when tapped.
- Settings → App icon: pick a new home screen icon, a glowing lowercase t in Classic or any theme's colors, on
  black or on white. The original icon stays the default.
- Tally Dev has its own icon: an orange glowing t with a DEV tag.

Changed
- No more abrupt jumps between screens. The steps of a new entry slide like pages (Back slides them the other way),
  the progress dots and the Back button ease in, and splitting slides the full form in instead of swapping sheets.
- Filtering or searching Activity keeps the list up until the new results arrive, instead of flashing the loading
  placeholder. Switching months in Insights eases the new month in and rolls its totals.
- Charts draw in from the left when they appear, screens that had to load fade their content in, the reconcile
  keypad fades out when the answer comes in, and toasts slide away instead of vanishing.
- "Duplicate to today" in an entry's menu turns the open editor into the copy, instead of closing it and opening
  another one.
- A new entry starts empty: no category or account is picked for you, and switching between Spent, Income and the
  rest no longer picks one either.
- Editing an entry, the amount keypad is its own raised panel with a Done button, and it springs up and slides back
  down over the save button.
- Quick actions in a new entry can be undone: tap the highlighted one again to clear what it filled in. They stay
  put while you type, so the form no longer jumps.
- Select mode in Activity slides a check circle into every row at once, and its action bar slides up.
- Every button, chip, keypad key and row responds to touch more smoothly. Rows wait a beat before highlighting, so
  starting a scroll no longer flashes the row under your thumb.
- Editing a single entry's category checks that entry's own category.
- VoiceOver reads entries as one item ("Chipotle, Dining Out, 13.89 dollars, Chase CC") with Edit, Duplicate,
  Change category and Delete as actions, and no longer reads icon names aloud.

Fixed
- Opening a new entry or an entry to edit could flash the last entry's amount and details for a moment.
- Typing a budget right after leaving another budget field could wipe what you'd typed when the first one saved.
- The switches on Settings → Home screen flipped back until the save finished, then flipped again.
- The account page showed a month-end chart and balance for a moment before switching to the daily ones.
- Tapping an entry opened two editors on top of each other, so it took two taps on X to close.
- The keypad could get stuck partway down the screen when opening a new entry.
- Undo did nothing: the tap went through the toast to the row underneath.
- A row that reappeared where a deleted one had been could stay squashed flat.
- The theme glow at the top of each tab stopped short of the right edge.
- The faded edge above the keypad was cut off on the right (the fade is gone with the new keypad panel).
- The text under the + in the tab bar sat too high, and the + is drawn smaller to match the other icons.

Developer
- `patches/expo-router+57.0.22.patch` (applied by `npm install`) rounds the long-press preview. It is native, so a
  rebuild is needed once to pick it up.

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
