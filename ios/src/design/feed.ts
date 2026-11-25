// Long lists of entries read a page at a time, and pull to refresh, shared by Activity and the account and category
// pages.
import { useMemo, useState } from 'react'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { api, type TxnPage, type TxnQuery } from '@/lib/api'
import { refreshBank, useBank } from '@/lib/bank'

export const PAGE = 60

/** A list read a page at a time. The query is the key's second part, so the cache kept on the phone sees a search
 *  (`q`) and leaves it out (`keepOnPhone`); a search is also let go from memory after 5 minutes, not a week. */
export function pagedQuery(query: TxnQuery) {
  return {
    queryKey: ['transactions', { ...query, paged: true }],
    queryFn: ({ pageParam }: { pageParam: number }) => api.transactions({ ...query, limit: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last: TxnPage, pages: TxnPage[]) => { const n = pages.reduce((k, x) => k + x.items.length, 0); return n < last.total ? n : undefined },
    staleTime: 30_000,
    ...(query.q ? { gcTime: 5 * 60_000 } : {}),
  }
}

/** `keep`: show the last list while a changed query loads (a filter or a search), instead of a blank. */
export function usePaged(query: TxnQuery, { enabled = true, keep = false }: { enabled?: boolean; keep?: boolean } = {}) {
  const q = useInfiniteQuery({ ...pagedQuery(query), enabled, ...(keep ? { placeholderData: keepPreviousData } : {}) })
  const rows = useMemo(() => {
    const seen = new Set<number>()
    return (q.data?.pages ?? []).flatMap((x) => x.items).filter((t) => !seen.has(t.id) && !!seen.add(t.id))
  }, [q.data])
  const more = () => { if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage() }
  return { q, rows, first: q.data?.pages[0], more }
}

/** Pull to refresh: asks the banks first when the server has bank sync, then reloads everything. */
export function useRefresh() {
  const bank = useBank().data
  const [refreshing, setRefreshing] = useState(false)
  const refresh = async () => {
    setRefreshing(true)
    try { if (bank) await api.bank.sync(0).catch(() => {}); await refreshBank() } finally { setRefreshing(false) }
  }
  return { refreshing, refresh }
}
