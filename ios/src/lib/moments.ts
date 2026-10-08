// Moments worth a little celebration on Home, each shown once: money landing today (payday), and net worth crossing a
// round number on the way up.
import type { Bootstrap, Txn } from './api'

export const PAYDAY_MIN = 20000 // $200: less is a refund or a Venmo, not a payday
export const STEP = 500000 // net worth milestones every $5,000

/** Today's money in big enough to count, not celebrated yet. */
export function paydays(b: Bootstrap, rows: Txn[], seen: number[]): Txn[] {
  const income = new Set(b.categories.filter((c) => c.type === 'Money in').map((c) => c.id))
  return rows.filter((t) => t.date === b.today && income.has(t.category_id) && t.amount >= PAYDAY_MIN && !seen.includes(t.id))
}

/** The highest round number net worth has passed since `last` (the figure Home last showed), or null. Crossing zero
 *  counts too: out of the red is the biggest one. */
export function milestone(last: number | null, now: number): number | null {
  if (last == null || now <= last) return null
  const top = Math.floor(now / STEP) * STEP
  if (top > last && top <= now) return top
  return null
}
