// The arithmetic under the month chart, kept apart from the view so it can be tested: a smooth line that never
// overshoots, and a scale with a round top and zero at the bottom.
import { axisLabel } from './chart'

/** A monotone cubic path (Fritsch-Carlson) through the points: smooth, but it never bulges past a point, so a day
 *  with no spending stays flat and the line never dips under what was spent. */
export function curve(xs: number[], ys: number[]): string {
  const n = Math.min(xs.length, ys.length)
  if (!n) return ''
  const f = (v: number) => v.toFixed(1)
  if (n === 1) return `M${f(xs[0])},${f(ys[0])}`
  const dx: number[] = [], m: number[] = []
  for (let i = 0; i < n - 1; i++) { dx.push(xs[i + 1] - xs[i]); m.push((ys[i + 1] - ys[i]) / (dx[i] || 1)) }
  const t: number[] = [m[0]]
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2)
  t.push(m[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i] }
  }
  let d = `M${f(xs[0])},${f(ys[0])}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C${f(xs[i] + h)},${f(ys[i] + t[i] * h)} ${f(xs[i + 1] - h)},${f(ys[i + 1] - t[i + 1] * h)} ${f(xs[i + 1])},${f(ys[i + 1])}`
  }
  return d
}

/** A round top for the scale with a little more choice than the bars' (3, 4, 6 and 8 too), so a line at $2,600
 *  tops out at $3k rather than leaving half the plot empty under $5k. Its half is a round label too. $100 for
 *  nothing above zero. */
export function lineTop(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 100_00
  const p = 10 ** Math.floor(Math.log10(v))
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * p >= v - 1e-9) ?? 10) * p
}

/** The scale of a running total `h` points tall: a round top at or above the largest value, zero at the bottom (or
 *  the lowest value, when refunds take the total below zero), and three gridlines with their labels. */
export function lineScale(values: number[], h: number): { lo: number; hi: number; y: (v: number) => number; grid: { value: number; y: number; label: string }[] } {
  const v = values.filter(Number.isFinite)
  const hi = lineTop(Math.max(0, ...v))
  const lo = Math.min(0, ...v)
  const y = (x: number) => ((hi - x) / (hi - lo || 1)) * h
  return { lo, hi, y, grid: [hi, hi / 2, 0].map((value) => ({ value, y: y(value), label: axisLabel(value) })) }
}
