import { useMemo } from 'react'
import { keepPreviousData, QueryClient, useQuery } from '@tanstack/react-query'
import { api, type Account, type Bootstrap, type Category, type Txn, type TxnPage, type TxnQuery } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 1000 * 60 * 60 * 24 * 7, retry: 1 },
  },
})

export const useBootstrap = () => useQuery({ queryKey: ['bootstrap'], queryFn: api.bootstrap, staleTime: 60_000 })

/** A search (`q`) is kept for 5 minutes, not a week: each one typed was a new entry in the cache saved on the phone. */
export const useTransactions = (q: TxnQuery, enabled = true) =>
  useQuery({ queryKey: ['transactions', q], queryFn: () => api.transactions(q), placeholderData: keepPreviousData, enabled,
    ...(q.q ? { gcTime: 5 * 60_000 } : {}) })

/** What the cache saved on the phone keeps: what a cold start paints (bootstrap, Settings, the lists without a
 *  search). Searches, single entries and month-end answers are fetched again. */
export const keepOnPhone = (key: readonly unknown[]): boolean => {
  if (key[0] === 'bootstrap' || key[0] === 'admin') return true
  if (key[0] !== 'transactions' || key[1] === 'one') return false
  const q = key[1] as { q?: string } | undefined
  return !q?.q
}

/** A row that's already in some cached list, so an editor can fill in on its first frame instead of after a fetch. */
export function cachedTxn(id: number): Txn | undefined {
  for (const [, data] of queryClient.getQueriesData<unknown>({ queryKey: ['transactions'] })) {
    const pages = (data as { pages?: TxnPage[] } | undefined)?.pages ?? [data as TxnPage]
    for (const p of pages) {
      const hit = Array.isArray(p?.items) ? p.items.find((x) => x.id === id) : undefined
      if (hit) return hit
    }
  }
  return undefined
}

/** Anything that changes rows: refresh balances, months and every list. Single entries not on screen are dropped,
 *  not just marked stale: an editor opened later started from the old copy and saved it back over the change. */
export const invalidateAll = () => {
  queryClient.removeQueries({ queryKey: ['transactions', 'one'], type: 'inactive' })
  return refreshAll()
}
const refreshAll = () => Promise.all([
  queryClient.invalidateQueries({ queryKey: ['bootstrap'] }),
  queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  queryClient.invalidateQueries({ queryKey: ['admin'] }),
])

export interface Lookups { acct: Map<number, Account>; cat: Map<number, Category> }

export function useLookups(b: Bootstrap | undefined): Lookups {
  return useMemo(() => ({
    acct: new Map((b?.accounts ?? []).map((a) => [a.id, a])),
    cat: new Map((b?.categories ?? []).map((c) => [c.id, c])),
  }), [b])
}
