// The numbers behind Insights: a period (a month by day, six months, a year, or everything, by month), paged back in
// time, read from the bootstrap's monthly rows; for a single month, the days come from its entries.
import type { Bootstrap, MonthRow } from '@/lib/api'
import { addDays, fromISO, monthOf, toISO } from '@/lib/dates'
import type { BarDatum } from './ui/BarChart'

export type Range = 'M' | '6M' | 'Y' | 'All'
export type Metric = 'spent' | 'money_in'

const SHORT = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const mon = (iso: string, style: 'short' | 'long' = 'short') => fromISO(iso).toLocaleDateString('en-US', { month: style })
const year = (iso: string) => iso.slice(0, 4)
const addMonths = (iso: string, n: number) => {
  const d = fromISO(iso)
  return toISO(new Date(d.getFullYear(), d.getMonth() + n, 1))
}

export const monthName = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

/** The months a period covers, oldest first, and whether paging further back or forward has anything. */
export function window(b: Bootstrap, current: string, range: Range, offset: number): { months: string[]; older: boolean; newer: boolean } {
  const first = monthOf(b.start)
  let months: string[]
  if (range === 'M') months = [addMonths(current, offset)]
  else if (range === '6M') { const end = addMonths(current, offset * 6); months = Array.from({ length: 6 }, (_, i) => addMonths(end, i - 5)) }
  else if (range === 'Y') { const y = Number(year(current)) + offset; months = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}-01`) }
  else months = (() => { const out: string[] = []; for (let m = first; m <= current; m = addMonths(m, 1)) out.push(m); return out })()
  return { months, older: range !== 'All' && months[0] > first, newer: range !== 'All' && months[months.length - 1] < current }
}

export function rangeLabel(months: string[], range: Range): string {
  const a = months[0], z = months[months.length - 1]
  if (range === 'M') return monthName(a)
  if (range === 'Y') return year(a)
  return year(a) === year(z) ? `${mon(a)} – ${mon(z)} ${year(z)}` : `${mon(a)} ${year(a)} – ${mon(z)} ${year(z)}`
}

/** One bar a month. Months that haven't come yet, or came before the ledger starts, are empty. */
export function monthBars(rows: Map<string, MonthRow>, months: string[], value: (m: MonthRow) => number, range: Range, current = '9999'): BarDatum[] {
  return months.map((m) => ({
    key: m,
    label: range === 'All' ? (m.endsWith('-01-01') ? year(m) : '') : range === 'Y' ? SHORT[fromISO(m).getMonth()] : mon(m),
    value: rows.get(m) && m <= current ? Math.max(0, value(rows.get(m)!)) : 0,
    future: m > current,
  }))
}

/** One bar a day of a month, from its entries (amounts already signed for the metric). */
export function dayBars(month: string, entries: { date: string; amount: number }[], today = '9999'): BarDatum[] {
  const d = fromISO(month)
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const by = new Map<string, number>()
  for (const e of entries) by.set(e.date, (by.get(e.date) ?? 0) + e.amount)
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(month, i)
    return { key: day, label: String(i + 1), value: Math.max(0, by.get(day) ?? 0), future: day > today }
  })
}

/** The months of a period that count toward its average: begun, and within the ledger. */
export const counted = (b: Bootstrap, months: string[], today: string) =>
  months.filter((m) => m <= monthOf(today) && m >= monthOf(b.start))

/** Each category's total over these months. */
export function byCategory(rows: Map<string, MonthRow>, months: string[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const m of months) for (const [k, v] of Object.entries(rows.get(m)?.by_category ?? {})) out.set(Number(k), (out.get(Number(k)) ?? 0) + v)
  return out
}

/** The same length of time just before these months. */
export const before = (months: string[]) => months.map((m) => addMonths(m, -months.length))
