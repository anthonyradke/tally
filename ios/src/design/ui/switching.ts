// The arithmetic behind Activity's switcher and its list switch, kept apart from the views so it can be tested.
//
// Each option of the switcher has a light between 0 (a round button) and 1 (the colored capsule). A move eases every
// light from where it stood toward the new choice on one shared curve, so the lights always add up to 1, mid-move
// and when a move interrupts another: the capsules fill the bar exactly and never push past it.

/** How lit option `j` is, `t` (eased, 0 to 1) of the way from the lights `from` to the choice `target`. */
export function lit(from: readonly number[], target: number, t: number, j: number): number {
  'worklet'
  const f = from[j] ?? 0
  return f + ((j === target ? 1 : 0) - f) * t
}

/** Every light at `t`: where a new move starts when it interrupts this one. */
export function lights(from: readonly number[], target: number, t: number): number[] {
  'worklet'
  const out: number[] = []
  for (let j = 0; j < from.length; j++) out.push(lit(from, target, t, j))
  return out
}

/** A name's opacity for its light: hidden until the capsule is half open, then in by the time it's fully open. */
export function labelOpacity(l: number): number {
  'worklet'
  return Math.min(1, Math.max(0, (l - 0.5) * 2))
}

/** A day list cut after `rows` entries into the part a switch moves (`head`, a screenful and some) and the rest
 *  (`tail`), which the list mounts once the move is over. A day cut in two keeps one card: its head part is `open`
 *  (square bottom corners) and its tail part `cont` (no title, square top corners). Whole days pass through as is. */
export function splitHead<S extends { data: readonly unknown[] }>(sections: S[], rows: number): {
  head: (S & { open?: boolean })[]; tail: (S & { cont?: boolean })[]
} {
  const head: (S & { open?: boolean })[] = []
  const tail: (S & { cont?: boolean })[] = []
  let left = rows
  for (const s of sections) {
    if (left >= s.data.length) { head.push(s); left -= s.data.length; continue }
    if (left > 0) {
      head.push({ ...s, data: s.data.slice(0, left), open: true })
      tail.push({ ...s, data: s.data.slice(left), cont: true })
      left = 0
      continue
    }
    tail.push(s)
  }
  return { head, tail }
}

// ---------- the list's move on a switch ----------
// The old screenful and the new one are both on screen through the move: the old drifts away from the side the
// switcher moved toward and fades, the new comes in from that side, every item on a critically damped curve (a
// spring's own path, no overshoot), the first few each a beat after the one above.

/** How far a screenful travels, in points. */
export const SWAP_TRAVEL = 28
/** One item's move, the beat between the first few and how many lead. */
export const SWAP_ITEM_MS = 270
export const SWAP_STAGGER_MS = 12
export const SWAP_LEAD = 4
/** The whole move, from the first item starting to the last landing. */
export const SWAP_MS = SWAP_ITEM_MS + SWAP_STAGGER_MS * SWAP_LEAD

/** A critically damped spring's path from 0 to 1 over `x` in 0..1 (it starts at rest and settles without passing 1),
 *  scaled to land exactly on 1. */
export function settle(x: number): number {
  'worklet'
  const W = 6
  if (x <= 0) return 0
  if (x >= 1) return 1
  return (1 - (1 + W * x) * Math.exp(-W * x)) / (1 - (1 + W) * Math.exp(-W))
}

/** Item `i`'s own linear progress when the whole move is `x` (0..1) of the way through. */
export function itemProgress(x: number, i: number): number {
  'worklet'
  const at = x * SWAP_MS - Math.min(i, SWAP_LEAD) * SWAP_STAGGER_MS
  return Math.min(1, Math.max(0, at / SWAP_ITEM_MS))
}

/** Where item `i` of a screenful stands: `come` is how far the move bringing it in is (0..1, 1 once it's in), `go`
 *  how far the move taking it away is (0 until one starts), `dir` the side the switcher moved toward (1 right, -1
 *  left, 0 for a crossfade in place). The leaving screenful fades faster than it travels, so the new one reads
 *  clearly through most of the move. */
export function swapLook(come: number, go: number, dir: number, i: number): { opacity: number; x: number } {
  'worklet'
  const a = settle(itemProgress(come, i))
  const b = settle(itemProgress(go, i))
  return { opacity: a * (1 - Math.min(1, b / 0.7)), x: dir * SWAP_TRAVEL * (1 - a - b) }
}

/** The side a switch moves toward: 1 when the new option is right of the old one, -1 when left, 0 when the same. */
export const sideOf = (keys: readonly string[], from: string, to: string): number =>
  Math.sign(keys.indexOf(to) - keys.indexOf(from))
