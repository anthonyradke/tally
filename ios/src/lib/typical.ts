// What each spending category usually has spent by a given day of the month, from the months before. A month still
// going is compared with this rather than with a share of a whole month: rent paid on the 1st is all there by the
// 2nd, groceries come in through the month, and scaling by days gone by made the first read +650%.
import { useMemo } from 'react'
import type { Bootstrap, Txn } from './api'
import { useTransactions } from './data'
import { fromISO, lastOfMonth, monthOf, toISO } from './dates'

export interface Typical {
  /** Category id → average spent by this day of the month in the months before. */
  by: Map<number, number>
  /** Category id → average spent over the whole of those months. */
  full: Map<number, number>
  months: number
}

/** The `n` whole months before today's (not before Tally started counting), oldest first. */
export function monthsBefore(today: string, n: number, start: string): string[] {
  const t = fromISO(today)
  const out: string[] = []
  for (let i = n; i >= 1; i--) {
    const m = toISO(new Date(t.getFullYear(), t.getMonth() - i, 1))
    if (m >= monthOf(start)) out.push(m)
  }
  return out
}

/** Averages over `months` of each category's spending up to `day` of each month, and over the whole month. */
export function typicalFrom(items: Pick<Txn, 'date' | 'amount' | 'category_id'>[], months: string[], day: number): Typical {
  const set = new Set(months)
  const by = new Map<number, number>(), full = new Map<number, number>()
  for (const x of items) {
    const m = monthOf(x.date)
    if (!set.has(m)) continue
    full.set(x.category_id, (full.get(x.category_id) ?? 0) + x.amount)
    if (Number(x.date.slice(8)) <= day) by.set(x.category_id, (by.get(x.category_id) ?? 0) + x.amount)
  }
  const n = Math.max(1, months.length)
  for (const [k, v] of by) by.set(k, v / n)
  for (const [k, v] of full) full.set(k, v / n)
  return { by, full, months: months.length }
}

/** `typicalFrom` for today, over up to `n` months before this one; null until the rows load (or with no history). */
export function useTypical(b: Bootstrap | undefined, n: number, enabled = true): Typical | null {
  const months = b ? monthsBefore(b.today, n, b.start) : []
  const start = months[0], end = months.length ? lastOfMonth(months.at(-1)!) : undefined
  const q = useTransactions({ type: 'Spending', start, end, limit: 10000 }, !!b && enabled && months.length > 0)
  const key = months.join()
  const day = b ? Number(b.today.slice(8)) : 0
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (q.data && months.length ? typicalFrom(q.data.items, months, day) : null), [q.data, key, day])
}
