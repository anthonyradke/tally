// Spending by day, for Insights' month calendar, and which day of the week tends to cost the most.
import type { Txn } from './api'
import { addDays, fromISO, lastOfMonth } from './dates'

/** Each day of `month` with its spending (refunds net out), in order. `rows` are spending rows. */
export function daysOf(month: string, rows: Pick<Txn, 'date' | 'amount'>[]): { date: string; cents: number }[] {
  const end = lastOfMonth(month)
  const by = new Map<string, number>()
  for (const t of rows) if (t.date >= month && t.date <= end) by.set(t.date, (by.get(t.date) ?? 0) + t.amount)
  const out: { date: string; cents: number }[] = []
  for (let d = month; d <= end; d = addDays(d, 1)) out.push({ date: d, cents: by.get(d) ?? 0 })
  return out
}

export const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

/** The weekday with the highest average spending over the `weeks` full weeks before today, and how it compares with
 *  the average day. Null with under four weeks of history or no clear winner (under 1.3× the average day). */
export function bigWeekday(rows: Pick<Txn, 'date' | 'amount'>[], today: string, start: string, weeks = 12) {
  const from = addDays(today, -7 * weeks)
  const first = from < start ? start : from
  const span = Math.round((fromISO(today).getTime() - fromISO(first).getTime()) / 864e5)
  if (span < 28) return null
  const sums = new Array(7).fill(0), counts = new Array(7).fill(0)
  for (let d = first; d < today; d = addDays(d, 1)) counts[fromISO(d).getDay()]++
  for (const t of rows) if (t.date >= first && t.date < today) sums[fromISO(t.date).getDay()] += t.amount
  const avg = sums.map((s, i) => (counts[i] ? s / counts[i] : 0))
  const all = sums.reduce((a, b) => a + b, 0) / counts.reduce((a, b) => a + b, 0)
  const k = avg.indexOf(Math.max(...avg))
  if (!all || avg[k] < all * 1.3) return null
  return { day: WEEKDAYS[k], avg: Math.round(avg[k]), times: avg[k] / all }
}
