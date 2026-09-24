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
