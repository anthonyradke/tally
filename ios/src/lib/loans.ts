// When a loan is paid off at the rate it's being paid: the engine's own monthly rule (add rate / 12, rounded, then take
// off the month's payments) run forward from this month's balance. Nothing here is saved; it's a projection.
import type { Account, Bootstrap, Recurring, Txn } from './api'
import { fromISO, monthOf, toISO } from './dates'

const PER_MONTH: Record<Recurring['freq'], number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, yearly: 1 / 12 }

export interface Payment { cents: number; from: 'recurring' | 'average' | 'month'; months?: number }

/** What goes to the loan in a month: its recurring payments if it has any (what's planned), else the average of up to
 *  the last three finished months it was open, else what's been paid this month so far. Null when nothing is known. */
export function monthlyPayment(b: Bootstrap, a: Account, rows: Txn[]): Payment | null {
  const plans = b.recurring.filter((r) => r.active && r.to_account_id === a.id)
  if (plans.length) return { cents: Math.round(plans.reduce((n, r) => n + r.amount * PER_MONTH[r.freq], 0)), from: 'recurring' }
  const now = monthOf(b.today)
  const first = a.opened && a.opened > b.start ? a.opened : b.start
  const paid = new Map<string, number>()
  for (const t of rows) {
    if (t.to_id !== a.id || t.date > b.today) continue
    paid.set(monthOf(t.date), (paid.get(monthOf(t.date)) ?? 0) + t.amount)
  }
  const done = b.months.map((m) => m.month).filter((m) => m >= first && m < now).slice(-3)
  const total = done.reduce((n, m) => n + (paid.get(m) ?? 0), 0)
  if (done.length && total > 0) return { cents: Math.round(total / done.length), from: 'average', months: done.length }
  const so = paid.get(now) ?? 0
  return so > 0 ? { cents: so, from: 'month' } : null
}

export interface Projection { months: number; interest: number; payoff: string }

/** Months until `balance` reaches 0 paying `payment` a month, the interest added on the way, and the month it's paid
 *  off ("2030-03-01"). `after` is the month the balance belongs to; the first payment is the month after it. Null
 *  when the payments never catch up with the interest (or would take over 50 years). */
export function project(balance: number, annualRate: number | null, payment: number, after: string): Projection | null {
  if (balance <= 0) return { months: 0, interest: 0, payoff: after }
  if (payment <= 0) return null
  const r = annualRate ?? 0
  let bal = balance, interest = 0, n = 0
  while (bal > 0) {
    if (++n > 600) return null
    const grown = Math.round(bal * (1 + r / 12))
    interest += grown - bal
    if (grown - bal >= payment) return null // interest alone is at least the payment: it never shrinks
    bal = Math.max(0, grown - payment)
  }
  const d = fromISO(after)
  return { months: n, interest, payoff: toISO(new Date(d.getFullYear(), d.getMonth() + n, 1)) }
}

/** "4 years 5 months", "11 months", "1 year". */
export function span(months: number): string {
  const y = Math.floor(months / 12), m = months % 12
  const part = (n: number, w: string) => (n ? `${n} ${w}${n === 1 ? '' : 's'}` : '')
  return [part(y, 'year'), part(m, 'month')].filter(Boolean).join(' ') || 'under a month'
}

/** A round extra amount worth trying: $25 on small payments, $50 under $500, else $100. */
export const extraFor = (payment: number) => (payment < 20000 ? 2500 : payment < 50000 ? 5000 : 10000)
