// When the emergency fund reaches its goal at the pace it's been growing: the month-end totals of the accounts marked
// as emergency fund over the last few finished months. A projection, nothing saved.
import type { Bootstrap } from './api'
import { fromISO, monthOf, toISO } from './dates'

export interface Pace { perMonth: number; months: number; eta: string }

/** Null without two finished months to compare, once the goal is met, or when it isn't growing. */
export function efPace(b: Bootstrap): Pace | null {
  const { goal, progress } = b.ef
  if (!goal || progress >= goal) return null
  const ef = b.accounts.filter((a) => a.ef).map((a) => String(a.id))
  const done = b.months.filter((m) => m.month < monthOf(b.today)).slice(-4)
  if (done.length < 2 || !ef.length) return null
  const total = (m: (typeof done)[number]) => ef.reduce((n, id) => n + (m.balances[id] ?? 0), 0)
  const perMonth = Math.round((total(done.at(-1)!) - total(done[0])) / (done.length - 1))
  if (perMonth <= 0) return null
  const months = Math.ceil((goal - progress) / perMonth)
  if (months > 600) return null
  const d = fromISO(monthOf(b.today))
  return { perMonth, months, eta: toISO(new Date(d.getFullYear(), d.getMonth() + months, 1)) }
}
