import { useSyncExternalStore } from 'react'

// Ids saved a moment ago; rows flash once so the eye finds where the new entry landed (DESIGN.md moment 3).
let ids = new Set<number>()
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function markRecent(list: number[]) {
  ids = new Set(list); emit()
  window.setTimeout(() => { ids = new Set(); emit() }, 2500)
}

export function useRecentIds(): Set<number> {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => ids)
}
