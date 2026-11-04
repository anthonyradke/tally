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

/** The weekday with the highest average spending over the `weeks` full weeks before `until` (today, or the day after
 *  the month being looked at), and how it compares with the average day. Each weekday's single costliest day is left
 *  out and so are recurring rows, so a rent day doesn't decide it. Null with under four weeks of history or no clear
 *  winner (under 1.3× the average day). */
export function bigWeekday(rows: (Pick<Txn, 'date' | 'amount'> & { recurring_id?: number | null })[], until: string, start: string, weeks = 12) {
  const from = addDays(until, -7 * weeks)
  const first = from < start ? start : from
  const span = Math.round((fromISO(until).getTime() - fromISO(first).getTime()) / 864e5)
  if (span < 28) return null
  const byDay = new Map<string, number>()
  for (const t of rows) if (t.date >= first && t.date < until && !t.recurring_id) byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amount)
  const days: number[][] = Array.from({ length: 7 }, () => [])
  for (let d = first; d < until; d = addDays(d, 1)) days[fromISO(d).getDay()].push(byDay.get(d) ?? 0)
  const trimmed = days.map((list) => (list.length > 1 ? [...list].sort((a, b) => a - b).slice(0, -1) : list))
  const avg = trimmed.map((list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0))
  const n = trimmed.reduce((a, l) => a + l.length, 0)
  const all = n ? trimmed.reduce((a, l) => a + l.reduce((x, y) => x + y, 0), 0) / n : 0
  const k = avg.indexOf(Math.max(...avg))
  if (!all || avg[k] < all * 1.3) return null
  return { day: WEEKDAYS[k], avg: Math.round(avg[k]), times: avg[k] / all }
}
