import { useMemo } from 'react'
import { keepPreviousData, QueryClient, useQuery } from '@tanstack/react-query'
import { api, type Account, type Bootstrap, type Category, type Txn, type TxnPage, type TxnQuery } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 1000 * 60 * 60 * 24 * 7, retry: 1 },
  },
})

/** How long a search's answer stays in memory once nothing shows it. */
export const SEARCH_GC = 5 * 60_000

/** The search a transactions key holds, if any: `['transactions', query]` (useTransactions) or
 *  `['transactions', 'feed', query]` (Activity's endless list). */
export function searchOf(key: readonly unknown[]): string {
  if (key[0] !== 'transactions') return ''
  const q = (typeof key[1] === 'string' ? key[2] : key[1]) as { q?: unknown; what?: unknown } | undefined
  const s = q && typeof q === 'object' ? (q.q ?? q.what) : undefined
  return typeof s === 'string' ? s.trim() : ''
}

// Every search is kept 5 minutes instead of a week, whichever screen asks (each prefix typed was a new entry that
// stayed in memory). A query that sets its own gcTime keeps it.
const defaults = queryClient.defaultQueryOptions.bind(queryClient)
queryClient.defaultQueryOptions = ((options) => {
  const o = defaults(options)
  if (options?.gcTime === undefined && o.queryKey && searchOf(o.queryKey)) o.gcTime = SEARCH_GC
  return o
}) as typeof defaults

export const useBootstrap = () => useQuery({ queryKey: ['bootstrap'], queryFn: api.bootstrap, staleTime: 60_000 })

/** A search (`q`) is kept for 5 minutes, not a week (see SEARCH_GC). */
export const useTransactions = (q: TxnQuery, enabled = true) =>
  useQuery({ queryKey: ['transactions', q], queryFn: () => api.transactions(q), placeholderData: keepPreviousData, enabled })

/** What the cache saved on the phone keeps: what a cold start paints (bootstrap, Settings, the lists without a
 *  search). Searches, single entries and month-end answers are fetched again. */
export const keepOnPhone = (key: readonly unknown[]): boolean => {
  if (key[0] === 'bootstrap' || key[0] === 'admin') return true
  if (key[0] !== 'transactions' || key[1] === 'one' || key[1] === 'all') return false // 'all': Select all's thousands
  return !searchOf(key)
}

/** A row that's already in some cached list, so an editor can fill in on its first frame instead of after a fetch. */
export function cachedTxn(id: number): Txn | undefined {
  return cachedTxnAt(id)?.row
}

/** `cachedTxn` with when the list it came from was fetched, for `initialDataUpdatedAt`: without it React Query
 *  took a copy from a list fetched long ago as fresh and never asked the server. */
export function cachedTxnAt(id: number): { row: Txn; at: number } | undefined {
  for (const q of queryClient.getQueryCache().findAll({ queryKey: ['transactions'] })) {
    const data = q.state.data as { pages?: TxnPage[] } | TxnPage | undefined
    if (!data) continue
    const pages = 'pages' in data && Array.isArray(data.pages) ? data.pages : [data as TxnPage]
    for (const p of pages) {
      const hit = Array.isArray(p?.items) ? p.items.find((x) => x.id === id) : undefined
      if (hit) return { row: hit, at: q.state.dataUpdatedAt }
    }
  }
  return undefined
}

/** One entry, painted at once from any list that has it and then checked with the server when that copy is stale.
 *  `id` null: nothing (an Add sheet with nothing to edit). */
export const useTxn = (id: number | null) => useQuery({
  queryKey: ['transactions', 'one', id], queryFn: () => api.transaction(id!), enabled: id !== null,
  initialData: () => (id !== null ? cachedTxnAt(id)?.row : undefined),
  initialDataUpdatedAt: () => (id !== null ? cachedTxnAt(id)?.at : undefined),
})

/** `cachedTxn` for many ids in one pass over the cache (a scan per id was slow over thousands of selected rows). */
export function cachedTxns(ids: number[]): Map<number, Txn> {
  const want = new Set(ids)
  const out = new Map<number, Txn>()
  for (const [, data] of queryClient.getQueriesData<unknown>({ queryKey: ['transactions'] })) {
    const pages = (data as { pages?: TxnPage[] } | undefined)?.pages ?? [data as TxnPage]
    for (const p of pages) {
      if (Array.isArray(p?.items)) for (const x of p.items) if (want.has(x.id) && !out.has(x.id)) out.set(x.id, x)
    }
  }
  return out
}

/** Anything that changes rows: refresh balances, months, every list and the bank inbox (an entry added or deleted
 *  can pair or free a bank row). Single entries not on screen are dropped, not just marked stale: an editor opened
 *  later started from the old copy and saved it back over the change. */
export const invalidateAll = () => {
  queryClient.removeQueries({ queryKey: ['transactions', 'one'], type: 'inactive' })
  return refreshAll()
}
const refreshAll = () => Promise.all([
  queryClient.invalidateQueries({ queryKey: ['bootstrap'] }),
  queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  queryClient.invalidateQueries({ queryKey: ['admin'] }),
  queryClient.invalidateQueries({ queryKey: ['deleted'] }), // Activity's "match in Recently deleted" and the list itself
  queryClient.invalidateQueries({ queryKey: ['bank'] }),
])

export interface Lookups { acct: Map<number, Account>; cat: Map<number, Category> }

export function useLookups(b: Bootstrap | undefined): Lookups {
  return useMemo(() => ({
    acct: new Map((b?.accounts ?? []).map((a) => [a.id, a])),
    cat: new Map((b?.categories ?? []).map((c) => [c.id, c])),
  }), [b])
}
