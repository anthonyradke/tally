// Where cash accounts and cards are headed over the next few weeks, from what's already on the books: recurring
// templates post their rows ~45 days ahead, and anything else dated in the future counts too. No guessing at
// everyday spending, so the lows here are the floor of what's planned, not a prediction.
import type { Account, Bootstrap, Txn } from './api'
import { addDays, fromISO } from './dates'
import { dailyBalances } from './balances'
import { formatChange } from './money'

export const AHEAD = 30

export interface Outlook {
  a: Account
  now: number
  /** Balance after each day from today (index 0) to today + AHEAD. */
  days: number[]
  end: number
  /** The lowest (cash) or highest (card) point ahead and its date. */
  worst: number
  worstOn: string
  /** Scheduled rows touching the account in the window: in (to it) and out (from it), positive cents. */
  inflow: number
  outflow: number
  count: number
  /** Cash only: the first day it would go below zero. */
  belowZero: string | null
}

export function outlook(a: Account, rows: Txn[], start: string, today: string, ahead = AHEAD): Outlook {
  const end = addDays(today, ahead)
  const s = dailyBalances(a, rows, start, end)
  const from = s.dates.indexOf(today)
  const days = s.values.slice(from)
  const dates = s.dates.slice(from)
  const card = a.kind === 'card'
  let k = 0
  days.forEach((v, i) => { if (card ? v > days[k] : v < days[k]) k = i })
  let inflow = 0, outflow = 0, count = 0
  for (const t of rows) {
    if (t.date <= today || t.date > end) continue
    if (t.to_id === a.id) { inflow += t.amount; count++ }
    if (t.from_id === a.id) { outflow += t.amount; count++ }
  }
  const neg = card ? -1 : dates.findIndex((_, i) => days[i] < 0)
  return { a, now: days[0], days, end: days.at(-1)!, worst: days[k], worstOn: dates[k], inflow, outflow, count,
    belowZero: !card && neg > 0 ? dates[neg] : null }
}

/** Active cash accounts and cards with something scheduled in the window, cash first. */
export function outlooks(b: Bootstrap, rows: Txn[], ahead = AHEAD): Outlook[] {
  return b.accounts.filter((a) => a.active && (a.kind === 'cash' || a.kind === 'card'))
    .map((a) => outlook(a, rows, b.start, b.today, ahead))
    .filter((o) => o.count > 0)
    .sort((x, y) => (x.a.kind === y.a.kind ? 0 : x.a.kind === 'cash' ? -1 : 1))
}

/** One scale for every small line in Next 30 days: the biggest swing among them. Each line scaled to itself drew a
 *  card's $12 charge as tall a step as rent out of checking. */
export function sharedSpan(list: Pick<Outlook, 'days'>[]): number {
  return Math.max(1, ...list.map((o) => Math.max(...o.days) - Math.min(...o.days)))
}

/** The line under an account in Next 30 days. A card says what it means for what's owed, since "+$12" read like money
 *  coming in. */
export function aheadLine(o: Pick<Outlook, 'a' | 'inflow' | 'outflow' | 'count' | 'belowZero'>): string {
  if (o.belowZero) return `Below zero on ${fromISO(o.belowZero).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  // What's owed goes up with a card's charges; a cash account's balance with what comes in.
  const net = o.a.kind === 'card' ? o.outflow - o.inflow : o.inflow - o.outflow
  if (!net) return `${o.count} scheduled, no change`
  return `${o.count} scheduled, ${formatChange(net, 'always')}${o.a.kind === 'card' ? ' owed' : ''}`
}
