import { useMemo } from 'react'
import { keepPreviousData, QueryClient, useQuery } from '@tanstack/react-query'
import { api, type Account, type Bootstrap, type Category, type TxnQuery } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 1000 * 60 * 60 * 24 * 7, retry: 1 },
  },
})

export const useBootstrap = () => useQuery({ queryKey: ['bootstrap'], queryFn: api.bootstrap, staleTime: 60_000 })

export const useTransactions = (q: TxnQuery, enabled = true) =>
  useQuery({ queryKey: ['transactions', q], queryFn: () => api.transactions(q), placeholderData: keepPreviousData, enabled })

/** Anything that changes rows: refresh balances, months and every list. */
export const invalidateAll = () => Promise.all([
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
