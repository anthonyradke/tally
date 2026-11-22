// Activity's filters live outside the screen so the Filters sheet can edit them.
import { create } from 'zustand'
import type { CatType, TxnQuery } from './api'
import { activeRange, ranges } from './filterBar'

export interface Filters {
  q: string; type: CatType | ''; category?: number; account?: number; start?: string; end?: string
  tag?: string; group?: string; sort: 'date' | 'amount'; dir: 'asc' | 'desc'
}
export const EMPTY: Filters = { q: '', type: '', sort: 'date', dir: 'desc' }

/** `view`: the saved view last put on, so the sheet can offer to update it once the filters move on from it. */
interface S { f: Filters; view: number | null; set: (p: Partial<Filters>) => void; replace: (f: Filters, view?: number | null) => void; reset: () => void }
export const useFilters = create<S>((set) => ({
  f: EMPTY,
  view: null,
  set: (p) => set((s) => ({ f: { ...s.f, ...p } })),
  replace: (f, view = null) => set({ f, view }),
  reset: () => set({ f: EMPTY, view: null }),
}))

/** How many filters beyond search and the type chips are on (drives the filter button's badge). */
export const extraCount = (f: Filters) =>
  [f.category, f.account, f.start || f.end, f.tag, f.group, f.sort !== 'date' || f.dir !== 'desc'].filter(Boolean).length

export const toQuery = (f: Filters): TxnQuery => ({
  q: f.q || undefined, type: f.type || undefined, category: f.category, account: f.account, start: f.start, end: f.end,
  tag: f.tag, group: f.group, sort: f.sort, dir: f.dir,
})

/** An id from a link or a saved view, or undefined when it isn't one (so a bad value can't filter silently). */
export const toId = (v?: string | null) => (v && Number.isInteger(Number(v)) ? Number(v) : undefined)

/** A saved view stores the filters as a query string. A range with a name (last month, this year) is kept by its
 *  name and worked out again when the view goes on, so "Dining last month" still means last month in December.
 *  Other dates (a day from Insights, a month) stay as they are. */
export function viewQuery(f: Filters, today: string): string {
  const when = activeRange(f, today)
  const kept = when && when !== 'all' ? { ...f, start: undefined, end: undefined, when } : f
  return new URLSearchParams(Object.entries(kept).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString()
}

/** The filters a saved view's query string stands for. */
export function fromViewQuery(query: string, today: string): Filters {
  const p = new URLSearchParams(query)
  const n = (k: string) => toId(p.get(k))
  const when = ranges(today).find(([k]) => k === p.get('when'))?.[2]
  return { q: p.get('q') ?? '', type: (p.get('type') ?? '') as CatType | '', category: n('category'), account: n('account'),
    start: when ? when.start : p.get('start') ?? undefined, end: when ? when.end : p.get('end') ?? undefined,
    tag: p.get('tag') ?? undefined, group: p.get('group') ?? undefined, sort: (p.get('sort') as Filters['sort']) ?? 'date', dir: (p.get('dir') as Filters['dir']) ?? 'desc' }
}

/** Whether these filters are exactly what a saved view puts on (its query read the way it would be saved now). */
export const isView = (query: string, f: Filters, today: string) => viewQuery(fromViewQuery(query, today), today) === viewQuery(f, today)
