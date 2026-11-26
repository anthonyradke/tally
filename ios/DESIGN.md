# Design: Tally for iPhone

**Since 4.0 (2026-11-25).** Tally should feel like an app Apple made that happens to know your money: system
colors, text styles and controls, inset grouped lists, Liquid Glass bars, and one signature per screen. Changes to
anything below get written here first.

## Principles
- **The bank does the typing.** Bank rows arrive on their own; Tally adds what it's sure of and asks about the rest
  in the check-in. The keypad is for cash and money between people.
- **One number first.** Each root screen opens on a single large figure (the month's spending, net worth, a
  balance) with what it means underneath in one short line.
- **Short words.** Titles in title case, one-line footers, no explanations a person wouldn't need twice. Settings
  lists use small gray headers.
- **Real logos.** Every entry leads with its merchant's or bank's logo, or the category's symbol white on its color.

## Color
- System colors for categories and states, light and dark (`src/design/theme.ts`).
- Tally's own tint, a deep emerald (`TINT`), for everything tappable and for money coming in, the way Notes is
  yellow and Health is pink.
- Brand colors where a brand is the subject: a wash at the top of an entry's page, and each account's card.

## Signatures
- **Rings** on Summary: this month's spending against a usual month outside, and inside where a usual month is by
  today (what earlier months had spent by the same day, so rent on the 1st is in both). Outer ahead of inner means
  spending faster than usual; the outer ring turns orange, then red past a full lap. With no earlier month, the
  inner ring is the share of the month gone.
- **This month against last** on Summary, under the rings, after Stocks: this month's spending added up day by day
  as a tint line ending on today's dot, last month's in gray behind it. Press and hold to read a day; the figure
  and its one line ("$170 less than last month by the 12th") follow the finger with a tick a day. It's the first of
  a row of pages (the week is the second) with page dots under them; the last page looked at stays.
- **Wallet** on Accounts: cards and bank accounts stacked as cards in their banks' colors, the account name and
  last four digits on the face, or a picture of the real card. A card zooms open into its page (iOS 18 zoom).
- **Trends** on Insights, after Health: a grid with its scale on the right, a dashed average, bars that dim
  around the one under the finger, and a swipe to page through time.
- **Brand wash** on an entry's page, fading from the merchant's color into the background.
- **Mail's switcher** on Activity: the chosen filter widens into a colored capsule; a swipe across jumps to the
  first or last. The capsule moves the instant the finger lifts; the list crossfades to the new filter as Mail's
  does (out 90 ms, in 150 ms), never through a blank.

## Motion
After Face ID and Apple Pay: quick ease-out curves and critically damped springs, nothing overshoots or wobbles
(`src/design/motion.ts`). Numbers change like SwiftUI's numeric text, rings draw in from the top, and setup ends on
a drawn checkmark. Haptics mark taps (light), commits (success) and refusals (the passcode shake).

## Gestures
- Rows swipe like Mail: left to delete; in the check-in, right to add and left to skip.
- Press and hold an entry for a preview and a menu.
- Charts that page read on press and hold (as Health's do); a quick swipe pages.
- Holding delete on the keypad keeps deleting, faster the longer it's held.
