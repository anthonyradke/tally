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
export const addMonths = (iso: string, n: number) => {
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

/** One bar a month. Months that haven't come yet, or came before the ledger starts, are empty. Everything (All)
 *  reads by initials while it fits in a year, else by year at each January and at its first bar. */
export function monthBars(rows: Map<string, MonthRow>, months: string[], value: (m: MonthRow) => number, range: Range, current = '9999'): BarDatum[] {
  const initials = range === 'Y' || (range === 'All' && months.length <= 12)
  return months.map((m, i) => ({
    key: m,
    label: initials ? SHORT[fromISO(m).getMonth()] : range === 'All' ? (m.endsWith('-01-01') || (i === 0 && !months[1]?.endsWith('-01-01')) ? year(m) : '') : mon(m),
    value: rows.get(m) && m <= current ? Math.max(0, value(rows.get(m)!)) : 0,
    future: m > current,
  }))
}

/** One bar a day of a month, from its entries (amounts already signed for the metric), each day's refunds netted
 *  out. Days after today stay empty: a scheduled bill hasn't been spent yet. */
export function dayBars(month: string, entries: { date: string; amount: number }[], today = '9999'): BarDatum[] {
  const d = fromISO(month)
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const by = new Map<string, number>()
  for (const e of entries) by.set(e.date, (by.get(e.date) ?? 0) + e.amount)
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(month, i)
    return { key: day, label: String(i + 1), value: day > today ? 0 : Math.max(0, by.get(day) ?? 0), future: day > today }
  })
}

/** The months of a period that count toward its average: begun, and within the ledger. */
export const counted = (b: Pick<Bootstrap, 'start'>, months: string[], today: string) =>
  months.filter((m) => m <= monthOf(today) && m >= monthOf(b.start))

/** Each category's total over these months. */
export function byCategory(rows: Map<string, MonthRow>, months: string[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const m of months) for (const [k, v] of Object.entries(rows.get(m)?.by_category ?? {})) out.set(Number(k), (out.get(Number(k)) ?? 0) + v)
  return out
}

/** The same length of time just before these months. */
export const before = (months: string[]) => months.map((m) => addMonths(m, -months.length))

/** The months of a period that ran their whole course: begun within the ledger and ended before this one. The
 *  ledger's first month is often partial (a bank gives two years back from the day it's linked), so it's left out
 *  while another full month is there. */
export function complete(b: Pick<Bootstrap, 'start'>, months: string[], today: string): string[] {
  const first = monthOf(b.start)
  const done = months.filter((m) => m < monthOf(today) && m >= first)
  return done.length > 1 ? done.filter((m) => m !== first) : done
}

/** The months an average divides by: the full ones, or the month in progress when it's the only one there is. */
export function averaged(b: Pick<Bootstrap, 'start'>, months: string[], today: string): string[] {
  const done = complete(b, months, today)
  return done.length ? done : counted(b, months, today)
}

/** Which period shows a month, and which bar it is, for opening a category on the month you were reading. */
export function locate(current: string, month: string, range: Exclude<Range, 'M'>, start: string): { offset: number; index: number | null } {
  if (month > current) return { offset: 0, index: null }
  const diff = monthsBetween(month, current)
  if (range === '6M') return { offset: -Math.floor(diff / 6) || 0, index: 5 - (diff % 6) }
  if (range === 'Y') return { offset: Number(year(month)) - Number(year(current)), index: fromISO(month).getMonth() }
  const i = monthsBetween(monthOf(start), month)
  return { offset: 0, index: i >= 0 ? i : null }
}

const monthsBetween = (a: string, b: string) => {
  const x = fromISO(a), y = fromISO(b)
  return (y.getFullYear() - x.getFullYear()) * 12 + y.getMonth() - x.getMonth()
}

const daysIn = (iso: string) => { const d = fromISO(iso); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() }

/** A month at its usual pace: what earlier months had spent by the same day of the month, and what they spent in
 *  all (averages over `months`). Rent on the 1st is in both, so it no longer reads as running far ahead. On a month's
 *  last day, the whole of each earlier month counts. Null without an earlier month to go by. */
export function usualBy(entries: { date: string; amount: number }[], months: string[], today: string): { byNow: number; whole: number } | null {
  if (!months.length) return null
  const day = Number(today.slice(8, 10))
  const last = day === daysIn(today)
  let byNow = 0, whole = 0
  for (const m of months) {
    const cut = last ? 31 : Math.min(day, daysIn(m))
    for (const e of entries) {
      if (monthOf(e.date) !== m) continue
      whole += e.amount
      if (Number(e.date.slice(8, 10)) <= cut) byNow += e.amount
    }
  }
  return { byNow: Math.round(byNow / months.length), whole: Math.round(whole / months.length) }
}

/** Summary's rings. Outer: this month's spending against a usual month. Inner: where a usual month is by today (the
 *  share of the month gone, with nothing to go by). `state`: `ahead` once spending is past the usual by today by a
 *  tenth of a month, `over` past a whole usual month. */
export function pace(spent: number, usual: { byNow: number; whole: number } | null, today: string): { outer: number; inner: number; state: 'ok' | 'ahead' | 'over'; usual: boolean } {
  const gone = Number(today.slice(8, 10)) / daysIn(today)
  if (!usual || usual.whole <= 0) return { outer: 0, inner: gone, state: 'ok', usual: false }
  const outer = spent / usual.whole
  const inner = Math.max(0, usual.byNow) / usual.whole
  return { outer, inner, usual: true, state: outer >= 1 ? 'over' : outer > inner + 0.1 ? 'ahead' : 'ok' }
}

export interface WeekDay { date: string; total: number; parts: { key: string; cents: number }[]; future: boolean }

/** A week of spending day by day from its entries, refunds netted out as the month's figure nets them. `key` sorts
 *  each day's spending into parts (a category's color); days after today are empty. */
export function weekDays(start: string, today: string, entries: { date: string; amount: number; key: string }[]): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i)
    const future = date > today
    const by = new Map<string, number>()
    let total = 0
    if (!future) for (const e of entries) if (e.date === date) { total += e.amount; by.set(e.key, (by.get(e.key) ?? 0) + e.amount) }
    return { date, total, future, parts: [...by].map(([key, cents]) => ({ key, cents })).filter((x) => x.cents > 0) }
  })
}

/** Each category's total from a list of entries, for one day of a month. */
export function byCategoryOn(entries: { date: string; amount: number; category_id: number }[], date: string): Map<number, number> {
  const out = new Map<number, number>()
  for (const e of entries) if (e.date === date) out.set(e.category_id, (out.get(e.category_id) ?? 0) + e.amount)
  return out
}

/** The highlight under Insights' chart, in one sentence the way Health words them: a full month (the picked one,
 *  else the latest) against the average of the period's other full months. Nothing for a month still going, one
 *  outside the ledger, or without another full month to compare. */
export function highlight(rows: Map<string, MonthRow>, full: string[], value: (m: MonthRow) => number, picked: string | null): { month: string; v: number; avg: number; diff: number } | null {
  const last = picked ?? full[full.length - 1]
  if (!last || !full.includes(last)) return null
  const others = full.filter((m) => m !== last)
  if (!others.length) return null
  const avg = others.reduce((n, m) => n + (rows.get(m) ? value(rows.get(m)!) : 0), 0) / others.length
  if (avg <= 0) return null
  const v = rows.get(last) ? value(rows.get(last)!) : 0
  return { month: last, v, avg, diff: Math.round(((v - avg) / avg) * 100) }
}

/** Summary's month chart: this month's spending added up day by day against last month's. `cur` runs from the 1st
 *  to today (one value a day), `prev` through the whole of last month, or null when last month came before the
 *  ledger. `days`: the slots across the chart, the longer month's length, so a 31st still has its place. */
export interface MonthCompare { month: string; prevMonth: string; days: number; cur: number[]; prev: number[] | null }

/** From the spending rows of last month and this one. Posted rows only (a scheduled bill waits for its day), and
 *  refunds net out on their day, so a day of refunds takes the running total down, even below zero. */
export function monthCompare(entries: { date: string; amount: number }[], today: string, start: string): MonthCompare {
  const month = monthOf(today), prevMonth = addMonths(month, -1)
  const pn = daysIn(prevMonth)
  const curDaily = new Array<number>(Number(today.slice(8, 10))).fill(0)
  const prevDaily = new Array<number>(pn).fill(0)
  for (const e of entries) {
    if (e.date > today || !Number.isFinite(e.amount)) continue
    const m = monthOf(e.date), d = Number(e.date.slice(8, 10)) - 1
    if (m === month) curDaily[d] += e.amount
    else if (m === prevMonth) prevDaily[d] += e.amount
  }
  const run = (a: number[]) => { let t = 0; return a.map((v) => (t += v)) }
  const known = prevMonth >= monthOf(start)
  return { month, prevMonth, days: known ? Math.max(daysIn(month), pn) : daysIn(month), cur: run(curDaily), prev: known ? run(prevDaily) : null }
}

/** Both months by day `d` (1-based): this month's total so far (null after today) and last month's by the same day
 *  (all of it for a day it didn't have: the 31st against a 30-day month). */
export function compareOn(c: Pick<MonthCompare, 'cur' | 'prev'>, d: number): { cur: number | null; prev: number | null } {
  const cur = d >= 1 && d <= c.cur.length ? c.cur[d - 1] : null
  const prev = c.prev?.length && d >= 1 ? c.prev[Math.min(d, c.prev.length) - 1] : null
  return { cur, prev }
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd, 23rd … 31st. */
export function ordinal(n: number): string {
  const t = n % 100, u = n % 10
  return `${n}${t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th'}`
}

const dollars = (c: number) => Math.round(c / 100)

/** The line under the month chart's figure, as Apple would word it: "$170 less than last month by today", "$40 more
 *  than last month by the 12th", "Same as last month by the 3rd". `day` null: today. Compared in whole dollars, the
 *  way both figures read. */
export function compareLine(cur: number, prev: number | null, day: number | null): string {
  const when = day === null ? 'by today' : `by the ${ordinal(day)}`
  if (prev === null) return 'Nothing to compare yet'
  if (dollars(cur) === 0 && dollars(prev) === 0) return day === null ? 'Nothing spent yet' : `Nothing spent ${when}`
  const diff = dollars(cur) - dollars(prev)
  if (diff === 0) return `Same as last month ${when}`
  return `$${Math.abs(diff).toLocaleString('en-US')} ${diff < 0 ? 'less' : 'more'} than last month ${when}`
}

/** What VoiceOver reads for the month chart: "Spent $1,240 this month, $170 less than last month by today", or for a
 *  day stepped to, "November 12, spent $980, $60 more than last month by the 12th". */
export function compareA11y(cur: number, prev: number | null, day: number | null, date?: string): string {
  const spent = `${dollars(cur) < 0 ? '−' : ''}$${Math.abs(dollars(cur)).toLocaleString('en-US')}`
  const head = day === null ? `Spent ${spent} this month` : `${date ? `${date}, s` : 'S'}pent ${spent}`
  if (prev === null) return head
  const line = compareLine(cur, prev, day)
  return `${head}, ${line[0].toLowerCase()}${line.slice(1)}`
}
