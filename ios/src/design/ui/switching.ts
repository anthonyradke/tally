// The arithmetic behind Activity's switcher, kept apart from the views so it can be tested.
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
