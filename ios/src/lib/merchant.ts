// One place's history, for its page (app/.../merchant/[key].tsx): every entry whose description names it, what they
// add up to, how often, and which category and account it usually goes to.
import type { Bootstrap, CatType, Txn } from './api'
import { monthOf } from './dates'
import { merchantKey } from '@/icons/merchants'

export interface Place {
  key: string
  /** The name as last written. */
  name: string
  /** Newest first. */
  rows: Txn[]
  /** What most of its money is: spending at a shop, money in from an employer. */
  type: CatType
  total: number
  visits: number
  average: number
  first: string
  last: string
  categoryId: number
  accountId: number | null
  /** Its total for each month up to this one, oldest first. */
  months: { month: string; cents: number }[]
}

const most = <T,>(xs: T[]): T => {
  const n = new Map<T, number>()
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1)
  return [...n.entries()].sort((a, z) => z[1] - a[1])[0][0]
}

/** `rows` in any order; future-dated entries are left out (they haven't happened). */
export function place(b: Bootstrap, key: string, rows: Txn[]): Place | null {
  const type = new Map(b.categories.map((c) => [c.id, c.type]))
  const mine = rows.filter((t) => t.date <= b.today && merchantKey(t.what) === key).sort((a, z) => (a.date < z.date ? 1 : a.date > z.date ? -1 : z.id - a.id))
  if (!mine.length) return null
  const kind = most(mine.map((t) => type.get(t.category_id) ?? 'Spending'))
  const counted = mine.filter((t) => (type.get(t.category_id) ?? 'Spending') === kind)
  const total = counted.reduce((n, t) => n + t.amount, 0)
  const byMonth = new Map<string, number>()
  for (const t of counted) byMonth.set(monthOf(t.date), (byMonth.get(monthOf(t.date)) ?? 0) + t.amount)
  const now = monthOf(b.today)
  return {
    key, name: mine[0].what, rows: mine, type: kind, total, visits: counted.length,
    average: Math.round(total / counted.length), first: mine.at(-1)!.date, last: mine[0].date,
    categoryId: most(counted.map((t) => t.category_id)),
    accountId: most(counted.map((t) => (kind === 'Money in' ? t.to_id : t.from_id))),
    months: b.months.filter((m) => m.month <= now).map((m) => ({ month: m.month, cents: byMonth.get(m.month) ?? 0 })),
  }
}

/** The places that took the most in `month`: spending only, at least $1. */
export function topPlaces(b: Bootstrap, month: string, end: string, rows: Txn[], n = 5) {
  const spend = new Set(b.categories.filter((c) => c.type === 'Spending').map((c) => c.id))
  const by = new Map<string, { key: string; name: string; cents: number; visits: number }>()
  for (const t of rows) {
    if (t.date < month || t.date > end || t.date > b.today || !spend.has(t.category_id)) continue
    const k = merchantKey(t.what)
    if (!k) continue
    const x = by.get(k) ?? { key: k, name: t.what, cents: 0, visits: 0 }
    by.set(k, { ...x, cents: x.cents + t.amount, visits: x.visits + 1 })
  }
  return [...by.values()].filter((x) => x.cents >= 100).sort((a, z) => z.cents - a.cents).slice(0, n)
}
