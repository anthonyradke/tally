// Activity's filters live outside the screen so the Filters sheet can edit them.
import { create } from 'zustand'
import type { CatType, TxnQuery } from './api'

export interface Filters {
  q: string; type: CatType | ''; category?: number; account?: number; start?: string; end?: string
  tag?: string; group?: string; sort: 'date' | 'amount'; dir: 'asc' | 'desc'
}
const EMPTY: Filters = { q: '', type: '', sort: 'date', dir: 'desc' }

interface S { f: Filters; set: (p: Partial<Filters>) => void; reset: () => void }
export const useFilters = create<S>((set) => ({
  f: EMPTY,
  set: (p) => set((s) => ({ f: { ...s.f, ...p } })),
  reset: () => set({ f: EMPTY }),
}))

/** How many filters beyond search and the type chips are on (drives the filter button's badge). */
export const extraCount = (f: Filters) =>
  [f.category, f.account, f.start || f.end, f.tag, f.group, f.sort !== 'date' || f.dir !== 'desc'].filter(Boolean).length

export const toQuery = (f: Filters): TxnQuery => ({
  q: f.q || undefined, type: f.type || undefined, category: f.category, account: f.account, start: f.start, end: f.end,
  tag: f.tag, group: f.group, sort: f.sort, dir: f.dir,
})

/** A saved view stores the filters as a query string. */
export const viewQuery = (f: Filters): string =>
  new URLSearchParams(Object.entries(f).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString()

/** The filters a saved view's query string stands for. */
export function fromViewQuery(query: string): Filters {
  const p = new URLSearchParams(query)
  const n = (k: string) => (p.get(k) ? Number(p.get(k)) : undefined)
  return { q: p.get('q') ?? '', type: (p.get('type') ?? '') as CatType | '', category: n('category'), account: n('account'), start: p.get('start') ?? undefined,
    end: p.get('end') ?? undefined, tag: p.get('tag') ?? undefined, sort: (p.get('sort') as Filters['sort']) ?? 'date', dir: (p.get('dir') as Filters['dir']) ?? 'desc' }
}
