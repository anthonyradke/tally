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

/** The first `rows` entries of a list grouped by day, cut inside a day when need be: what a switch shows first, so
 *  the list mounts a screenful instead of everything it had rendered before. A list no longer comes back as is. */
export function headOf<S extends { data: readonly unknown[] }>(sections: S[], rows: number): S[] {
  if (sections.reduce((n, s) => n + s.data.length, 0) <= rows) return sections
  const out: S[] = []
  let left = rows
  for (const s of sections) {
    if (left <= 0) break
    out.push(s.data.length <= left ? s : { ...s, data: s.data.slice(0, left) })
    left -= s.data.length
  }
  return out
}
