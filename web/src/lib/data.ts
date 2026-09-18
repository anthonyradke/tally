import { useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, type Account, type Bootstrap, type Category, type TxnQuery } from '@/api/client'

export const useBootstrap = () => useQuery({ queryKey: ['bootstrap'], queryFn: api.bootstrap, staleTime: 60_000 })

export const useTransactions = (q: TxnQuery, enabled = true) =>
  useQuery({ queryKey: ['transactions', q], queryFn: () => api.transactions(q), placeholderData: keepPreviousData, enabled })

export interface Lookups { acct: Map<number, Account>; cat: Map<number, Category> }

export function useLookups(b: Bootstrap | undefined): Lookups {
  return useMemo(() => ({
    acct: new Map((b?.accounts ?? []).map((a) => [a.id, a])),
    cat: new Map((b?.categories ?? []).map((c) => [c.id, c])),
  }), [b])
}
