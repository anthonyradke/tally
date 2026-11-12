// One hook for what nearly every screen needs: the bootstrap payload, id lookups and the resolvers that turn a row
// into its mark and presentation.
import { useCallback, useMemo } from 'react'
import { categoryVisual } from '@/icons/categories'
import { parseOverrides, resolveMark } from '@/icons/merchants'
import type { Bootstrap, Category, Txn } from './api'
import { useBootstrap, useLookups } from './data'
import { todayISO } from './dates'

/** Today on the phone, never earlier than the server's: the bootstrap's `today` is from the last fetch, which can be
 *  yesterday's after a night in the background, or days old offline. New entries default to this. */
export const liveToday = (b: Bootstrap | undefined): string => {
  const phone = todayISO()
  return b && b.today > phone ? b.today : phone
}

export function useTally() {
  const q = useBootstrap()
  const b = q.data
  const { acct, cat } = useLookups(b)
  const overrides = useMemo(() => parseOverrides(b?.settings?.merchant_marks), [b?.settings?.merchant_marks])
  const markFor = useCallback((what: string) => resolveMark(what, overrides), [overrides])
  const catOf = useCallback((t: Pick<Txn, 'category_id'>): Category =>
    cat.get(t.category_id) ?? { id: t.category_id, name: 'Unknown', type: 'Spending', icon: null, color: null, budget: null, active: false }, [cat])
  const typeOf = useCallback((t: Txn) => catOf(t).type, [catOf])
  return { q, b, acct, cat, markFor, catOf, typeOf, visual: categoryVisual, today: liveToday(b) }
}
