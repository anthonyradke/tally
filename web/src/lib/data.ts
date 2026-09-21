import { useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { parseOverrides, resolveMark } from '@/icons/merchants'
import { api, type Account, type Bootstrap, type Category, type TxnQuery } from '@/api/client'

export const useBootstrap = () => useQuery({ queryKey: ['bootstrap'], queryFn: api.bootstrap, staleTime: 60_000 })

/** Mark resolver with the user's logo overrides applied. null = use the category glyph. */
export function useMarkFor() {
  const raw = useBootstrap().data?.settings.merchant_marks
  return useMemo(() => { const o = parseOverrides(raw); return (what: string) => resolveMark(what, o) }, [raw])
}

export const useTransactions = (q: TxnQuery, enabled = true) =>
  useQuery({ queryKey: ['transactions', q], queryFn: () => api.transactions(q), placeholderData: keepPreviousData, enabled })

export interface Lookups { acct: Map<number, Account>; cat: Map<number, Category> }

export function useLookups(b: Bootstrap | undefined): Lookups {
  return useMemo(() => ({
    acct: new Map((b?.accounts ?? []).map((a) => [a.id, a])),
    cat: new Map((b?.categories ?? []).map((c) => [c.id, c])),
  }), [b])
}
