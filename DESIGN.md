# Design: Tally Glass
**Date:** 2026-09-21 · **Status:** confirmed by the user 2026-09-21. Replaces "Paper Ledger" (v1.0, tagged in git). Deviations edit this file first.
**Archetype:** personal instrument (one user, daily, glanceable) · **Register:** native iOS structure; expressive at the scrub chart, the Add keypad and post-add confirmation
**Goal (user's words):** "an extremely satisfying Apple-like front-end." Robinhood, SoFi and T3 Code are loose references, not templates.
**Pins (user):** Apple quality bar; glass on floating chrome only; grouped panels on Home + Insights only; SF system type; offline icon set.

## Direction
Feels like a first-party Apple app that happens to know your money. System grouped backgrounds, solid content, glass only on what floats above it. The eye lands on one number, and that number answers your finger: drag across a chart and the figure rolls to that day.

## Signature move
**The scrub.** Every trend chart is touchable. Dragging moves a hairline cursor and dot, and the figure above the chart rolls its digits to the value under your finger (same rolling-digit component as the keypad). Releasing springs back to today. Home's month panel does this with cumulative spending against last month's pace.

## Expressive moments
1. **Scrub** (above). Amplitude: high.
2. **Add sheet**: glass sheet, custom keypad, digits roll as you type. Amplitude: high (the daily ritual).
3. **Post-add**: the new row layout-animates into its day group with a fading tint; hero figures re-roll. Amplitude: medium.
4. **Arrival**: progress bars and the spending ring draw once when they first scroll into view. Amplitude: low.
Everything else is calm: no looping motion, no decorative entrances.

## Type
- SF Pro via `-apple-system` (Segoe UI Variable on Windows). Display 700, tracking −0.03em. Big figures (`display`, `title`) use
  proportional digits like Apple's own large numerals; rows, tables and small amounts stay tabular so columns align.
  Rolling digit columns take the measured width of the digit they show, so rolled and static figures space identically.
- Scale: 11 · 13 · 15 · 17 · 20 · 28 · 34 · 48 (hero) / 64 (≥900px).
- Roles: large title 34/700 · section title 20/700 · body 17/400 · row title 16/500 · label 13/500 fg-2 · footnote 11/500.
- **No all-caps labels and no "A · B" middot strings** in new UI. Labels are sentence case; secondary facts go on their own line or in a pill.

## Color
Tokens in `web/src/styles/tokens.css` (`light-dark()`).
- Neutrals are Apple's system grouped palette: light `bg #F2F2F7`, panels `#FFFFFF`, fills `#E9E9EE`; dark `bg #000000`, panels `#1C1C1E`, fills `#2C2C2E`/`#3A3A3C`. Text `#000`/`#FFF`, secondary ~`#6C6C70`/`#98989F` (≥4.5:1), tertiary decorative only.
- Ink (fg) is still the only interactive color: primary buttons, selected chips, the + button.
- One semantic pair: pos green, neg red. Used for money direction, never decoration.
- Identity ring: the 8 validated category tints from v1 are unchanged (see git history of this file for the validator run). They are never the sole identity channel: every tinted mark sits beside its glyph and name.
- Bank tints keep the user's identities (Chase blue, Amex green, SoFi orange, HSA grey, Roth violet).

## Glass (floating chrome only)
Tab bar, the ⌘K palette, the + button, toasts; sheets get the edge and highlight on a near-opaque fill (no live blur while they move). Content never.
- Recipe: translucent fill (`--glass-bg`) + `backdrop-filter: blur(20px) saturate(180%)`, a 0.5px edge (`--glass-edge`), a top specular highlight (inset 1px white at low alpha), and one soft ambient shadow (`--shadow-float`).
- Real Liquid Glass (refraction) is native-only; WebKit has no SVG filters in `backdrop-filter`, so this is the honest approximation. No WebGL.
- Tab bar: a floating pill 12px off the bottom safe area and 16px off the sides, the + as a raised ink disc in its centre.

## Space, shape, depth
- Spacing: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64. Tight inside a panel (8–12), 32 between sections.
- Radius: controls 12 · marks 10 · panels 22 · sheets 28 · pills 999. Radius grows with container size.
- Home + Insights: sections are **panels** (solid surface, no border, no shadow in light; no shadow in dark) under a section title with an optional "See all ›". Lists (Activity, Accounts, account detail) keep hairline rows on the background.
- Settings-style screens keep inset grouped lists.
- Pressable panels scale to .98 on press.

## Motion
- Timing: micro 120 · standard 240 · large 400 ms. Ease-out `cubic-bezier(.2,.8,.2,1)` for entries; springs for gestures (sheet 420/42, tab highlight 520/44).
- Transform and opacity only (plus SVG pathLength for chart and ring draws). Exception: a rolling digit column eases its width
  between digit widths.
- Performance budget is a 120 Hz frame (8 ms). Press feedback is CSS `:active` (compositor), not JS springs; Motion animations
  use `transform` strings so they run hardware-accelerated; sheets have no live backdrop blur; long lists skip layout
  animation and render in two passes. Measure with `/tmp/pw/perf.js` and `tabs.js` before and after motion changes.
- Numbers: rolling digits on every hero figure and scrub; month switches roll rather than swap.
- Never: bounce/elastic, looping or ambient motion, hover effects on touch, per-section entrance stagger.
- `prefers-reduced-motion`: durations → 0, digits snap, draws are instant.

## Never
- Glass on content, glow, gradients as decoration, a second accent hue.
- Cards inside cards; shadows on panels.
- ALL-CAPS eyebrows, middot meta strings, monospace data labels.
- Sparklines as decoration: a chart appears only where the trend is the point, and every chart can be scrubbed.
- Dark by default: follow the system; Settings can override.

## Resolved
- Row amounts: statement style (spending plain, money in green with +, transfers muted).
- Home's hero chart: net worth only once 3+ months exist; until then the month panel's spending-pace chart is the scrub moment.

## Open questions
- Entertainment and Subscriptions share the violet tint; give one a distinct hue in Settings defaults.
