# Design: Paper Ledger
**Date:** 2026-09-18 · **Status:** confirmed by the user 2026-09-18 after reviewing Home + Activity on iPhone (dark) and desktop (light). Deviations edit this file first.
**Archetype:** personal instrument (one user, daily, glanceable) · **Register:** product structure · expressive at: hero figure, Add keypad, post-add confirmation
**Grounding:** a premium paper bank statement's typographic discipline (one ink, right-aligned tabular figures, hairline rules, generous margins) + Robinhood's number-as-hero confidence (one large live figure per screen, everything else recedes)
**DNA:** editorial-minimal base (type + composition) + motion vocabulary borrowed from native iOS (spring sheets, layout-animated lists) · **Dominant axis:** type (the numerals)
**Pins (user):** Apple / Robinhood / X quality bar; monochrome-leaning; offline icon set; SF system type for native PWA feel

## Direction
Feels like a beautifully typeset statement that happens to be alive. Warm paper in daylight, true black at night. Color is earned by data: bank marks, category glyphs, and green/red deltas. Everything else is ink. The eye always lands on one number first.

## Signature move
**The ledger rule.** Every hero figure sits on a single 2px ink rule spanning the content width, like the total line on a statement. It is the only heavy line in the app. Where a figure has a goal (emergency fund, budget, Roth limit), progress is drawn *as that rule filling* from the left, ink over a hairline track.

## Expressive moments
1. **Hero figure roll** — digits roll into place on load and after any change (Robinhood). Amplitude: medium.
2. **Add sheet** — full-height spring sheet with a custom keypad; keys scale on press; the amount rolls as you type. Amplitude: high (this is the daily ritual).
3. **Post-add** — the new row layout-animates into the day group with a tint that fades over 1.2 s; the hero re-rolls. Amplitude: medium.
Everything else holds the calm structure register.

## Type
- Display (numerals ≥ 28px): SF Pro Display via `-apple-system` (Segoe UI Variable Display on Windows) — weight 700, tracking −0.03em, tabular figures
- Body: SF Pro Text via `-apple-system` (Segoe UI Variable Text on Windows) — weights 400 / 500 / 600
- Rationale: installed-to-home-screen PWA; system type is the HIG-native choice and SF's tabular numerals are the best on the platform. The "no system font" tell is accepted knowingly.
- Scale (≈3:4 steps, skip steps for contrast): 11 · 13 · 16 · 21 · 28 · 36 · 48 · 64
- Roles: caps label 11/600 +0.08em · secondary 13/400 · body 16/400–500 · row amount 16/600 tabular · title 28/700 · hero 48 (phone) / 64 (≥900px)
- Leading: body 1.5 · secondary 1.4 · display 1.05

## Color tokens
Defined in `web/src/styles/tokens.css` with `light-dark()`. Neutrals are warm paper (hue 80, chroma ≤ .01) in light; true black + hue-80 greys in dark. One semantic pair (pos green h150 / neg red h27), one focus blue, no interactive accent — buttons and selected states are **ink** (fg on bg inverted, like X).
Identity ring: 8 category tints (`--tint-*`: red, orange, amber, green, teal, blue, violet, pink). The first draft used one fixed L/C for all hues; the data-viz palette validator failed it (orange↔amber ΔE 5.6, teal under the chroma floor), so lightness now varies per hue. Validated 2026-09-18 — light `#fe8b82 #be6438 #d5ac1b #267625 #24bcb0 #3175c4 #b691e1 #b8437b` on `#f8f6f4` (all pass; contrast WARN on 4 tints → every tinted mark carries a glyph + text label), dark `#e86156 #b13d0c #c18434 #2c713a #11a6aa #4672b1 #793eab #cd7190` on `#000` — passes lightness, chroma and contrast; the violet↔blue neighbours land at ΔE 14.0 normal (floor 15) and 6.4 CVD (the band the validator allows only with secondary encoding). 110k random candidates found nothing better on a true-black surface inside the dark lightness band, so this is accepted knowingly: the ring is never the sole identity channel — every tinted mark sits beside its glyph and name. Re-run `dataviz/scripts/validate_palette.js` after any change. Bank tints keep the user's existing identities (Chase blue, Amex green, SoFi orange, HSA grey, Roth violet).
Contrast: fg-2 on bg ≥ 4.5:1 both modes; fg-3 is decorative/metadata only.

## Space, shape, depth
- Spacing: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64. Tight inside a group (4–8), loose between groups (24–32).
- Radius: controls 10 · keypad keys 12 · marks 10 · sheet 20 · pills 999.
- Depth: layered surfaces (`bg` → `surface` → `surface-2`), hairline `line` separators. **No cards in lists** — rules and white space (Tufte 1+1=3). Inset grouped lists only for settings-style screens. One hue-shifted shadow exists: the sheet's ambient shadow. Tab bar uses iOS-native blur, nothing else does.
- Content well: max 640px, flush-left; desktop ≥ 900px gets a left rail instead of a bottom bar and a two-pane Insights table.

## Motion
- Timing: micro 120 · standard 240 · large 400 ms · Easing: ease-out `cubic-bezier(.2,.8,.2,1)` for entries, ease-in for exits; springs for gestures (sheet: stiffness 420, damping 42)
- Allowed: `transform` and `opacity` only. Rolling digits, list `layout` on filter/sort, sheet drag-to-dismiss, row swipe actions, tab content cross-fade, ledger-rule fill.
- Never: bounce/elastic, animating height/margin, hover effects on touch, decorative motion.
- `prefers-reduced-motion`: durations → 0, digits snap, sheets fade.

## Never (this project's tells at risk)
- Nested cards, or cards as the default container.
- A second accent hue; gradients; glassmorphism beyond the tab bar; glow.
- Uniform spacing everywhere; centered body text.
- Dark-by-default: follow the system, user can override in Settings.
- Sparklines as decoration — a chart appears only where its trend is the point.

## Resolved at lock
- Row amounts: **statement style** (user's choice) — spending plain, money in and refunds carry a green +, transfers/saving/loan payments muted. Not Robinhood-style universal signing.
- Light-mode paper stays at hue 80 / chroma .004 (user approved as-is; can warm later if it reads too neutral on the phone).

## Open questions
- Entertainment and Subscriptions currently share the violet tint; give one of them a distinct hue in Settings defaults.
