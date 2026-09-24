// Small shared state for the app's moments of motion: rows that just arrived (saved or undone) unfold and glow once,
// and a quick action that was just saved floats its amount above its chip on Home.
import { create } from 'zustand'

interface Fresh { ids: Set<number>; mark: (ids: number[]) => void }
/** Entry ids that just appeared. Rows showing one unfold and glow when they first render; ids expire after a few
 *  seconds so a later scroll past them is quiet. */
export const useFresh = create<Fresh>((set) => ({
  ids: new Set(),
  mark: (ids) => {
    if (!ids.length) return
    set((s) => ({ ids: new Set([...s.ids, ...ids]) }))
    setTimeout(() => set((s) => ({ ids: new Set([...s.ids].filter((x) => !ids.includes(x))) })), 4000)
  },
}))
export const markFresh = (ids: number[]) => useFresh.getState().mark(ids)

interface Quick { last: { fav: number; cents: number; key: number } | null; show: (fav: number, cents: number) => void }
let n = 0
/** The quick action just saved from the composer, shown as a floating amount on Home for a moment. */
export const useQuickFloat = create<Quick>((set) => ({
  last: null,
  show: (fav, cents) => {
    const key = ++n
    set({ last: { fav, cents, key } })
    setTimeout(() => set((s) => (s.last?.key === key ? { last: null } : s)), 3000)
  },
}))

interface Wash { wash: { x: number; y: number; from: string; color: string; key: number } | null; start: (x: number, y: number, from: string, color: string) => void; end: () => void }
/** A theme change in flight: the old background fading off and a ripple of the new accent from the tapped card. */
export const useThemeWash = create<Wash>((set) => ({
  wash: null,
  start: (x, y, from, color) => set({ wash: { x, y, from, color, key: ++n } }),
  end: () => set({ wash: null }),
}))
