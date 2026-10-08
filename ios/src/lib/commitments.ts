// What the recurring templates add up to: every bill and subscription as a monthly figure (a yearly one counts a
// twelfth, a weekly one 52/12), split into what goes out and what comes in.
import type { Bootstrap, Recurring } from './api'

export const PER_MONTH: Record<Recurring['freq'], number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, yearly: 1 / 12 }

export interface Commitment { r: Recurring; monthly: number }
export interface Commitments { out: Commitment[]; in: Commitment[]; outMonthly: number; inMonthly: number }

/** Active templates only. Transfers between your own accounts count as neither. */
export function commitments(b: Bootstrap): Commitments {
  const type = new Map(b.categories.map((c) => [c.id, c.type]))
  const out: Commitment[] = [], inn: Commitment[] = []
  for (const r of b.recurring) {
    if (!r.active) continue
    const monthly = Math.round(r.amount * PER_MONTH[r.freq])
    const ty = type.get(r.category_id)
    if (ty === 'Money in') inn.push({ r, monthly })
    else if (ty === 'Spending' || ty === 'Loan' || ty === 'Saving') out.push({ r, monthly })
  }
  const by = (a: Commitment, z: Commitment) => z.monthly - a.monthly
  return { out: out.sort(by), in: inn.sort(by), outMonthly: out.reduce((n, x) => n + x.monthly, 0), inMonthly: inn.reduce((n, x) => n + x.monthly, 0) }
}
