// The arithmetic under the charts, kept apart from the views so it can be tested: the line's path, the scale's
// round top and the labels on its gridlines.

const finite = (v: number) => (Number.isFinite(v) ? v : 0)

/** The SVG path of a line chart and the area under it, `pad` points in from the top and bottom. A flat series is
 *  drawn across the middle (along the bottom it read as $0). Values that aren't numbers count as 0. */
export function linePath(points: number[], w: number, height: number, pad = 6): { line: string; area: string } {
  const v = points.map(finite)
  const n = v.length
  if (!n || w <= 0) return { line: '', area: '' }
  const lo = Math.min(...v), hi = Math.max(...v)
  const px = (i: number) => (n > 1 ? (i / (n - 1)) * w : w / 2)
  const py = (x: number) => (hi === lo ? height / 2 : pad + (1 - (x - lo) / (hi - lo)) * (height - pad * 2))
  const line = v.map((x, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(x).toFixed(1)}`).join(' ')
  return { line, area: n > 1 ? `${line} L${w},${height} L0,${height} Z` : '' }
}

/** A round top for a bar chart's scale (cents): 1, 2, 2.5 or 5 times a power of ten, at or above the largest value;
 *  $100 when nothing is above zero. */
export function niceMax(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 100_00
  const p = 10 ** Math.floor(Math.log10(v))
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= v - 1e-9) ?? 10) * p
}

const trim = (x: number) => String(Number(x.toFixed(2)))

/** A gridline's label, exact for any value the scale can produce: "$1.25k" (not "$1.3k"), "$2.50" (not "$3"). */
export function axisLabel(cents: number): string {
  const d = Math.abs(finite(cents)) / 100
  const s = cents < 0 ? '−' : ''
  if (d === 0) return '0'
  if (d < 1000) return `${s}$${Number.isInteger(d) ? d : d.toFixed(2)}`
  if (d < 1e6) return `${s}$${trim(d / 1000)}k`
  return `${s}$${trim(d / 1e6)}M`
}

/** The scale of a bar chart: its top and the three gridlines (top, middle, zero), each with its height from the
 *  bottom of a plot `h` tall and its label. */
export function barScale(values: number[], h: number, average = 0): { max: number; grid: { value: number; y: number; label: string }[] } {
  const max = niceMax(Math.max(0, finite(average), ...values.map(finite)))
  const grid = [max, max / 2, 0].map((value) => ({ value, y: h - (value / max) * h, label: axisLabel(value) }))
  return { max, grid }
}

/** A bar's height in a plot `h` tall: at least 3 points for any value above zero, none for zero, negatives and
 *  values that aren't numbers. */
export const barHeight = (value: number, max: number, h: number) =>
  finite(value) > 0 && max > 0 ? Math.min(h, Math.max(3, (value / max) * h)) : 0
