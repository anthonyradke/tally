// What the New design's screens read from the ledger: the bootstrap, lookups by id, today, and this month's row.
import { useCallback } from 'react'
import type { CatType, Txn } from '@/lib/api'
import { useBootstrap, useLookups } from '@/lib/data'
import { monthOf, todayISO } from '@/lib/dates'

export function useLedger() {
  const q = useBootstrap()
  const b = q.data
  const { acct, cat } = useLookups(b)
  const phone = todayISO()
  const today = b && b.today > phone ? b.today : phone
  const month = b?.months.find((m) => m.month === monthOf(today)) ?? b?.months.at(-1)
  const typeOf = useCallback((t: Pick<Txn, 'category_id'>): CatType | undefined => cat.get(t.category_id)?.type, [cat])
  return { q, b, acct, cat, today, month, typeOf }
}

/** The account an entry is "on", as a list shows it: where spending came from, where money in went. */
export const accountOf = (t: Pick<Txn, 'from_id' | 'to_id'>, type: CatType | undefined) =>
  type === 'Money in' ? t.to_id : t.from_id ?? t.to_id
