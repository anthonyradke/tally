// When each account was last caught up (the weekly pass through the bank's list in Catch up), kept on the phone.
// Catch up shows it where the account left off, and Home nudges when one hasn't been caught up in a while.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { fromISO } from './dates'

const KEY = 'tally.caughtUp'
/** Days after which Home suggests catching an account up. */
export const STALE_DAYS = 9
/** For an account never caught up: how old its newest entry gets before Home suggests it, so Catch up gets found. */
export const NEVER_DAYS = 7

interface S { at: Record<string, string> } // account id → ISO time
export const useCaughtUp = create<S>(() => ({ at: {} }))

export async function loadCaughtUp() {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}')
    if (v && typeof v === 'object' && !Array.isArray(v)) useCaughtUp.setState({ at: v })
  } catch { /* unreadable: start over */ }
}

export function markCaughtUp(accountId: number, when = new Date()) {
  const at = { ...useCaughtUp.getState().at, [String(accountId)]: when.toISOString() }
  useCaughtUp.setState({ at })
  AsyncStorage.setItem(KEY, JSON.stringify(at)).catch(() => {})
}

/** Whole days since `iso` (a time), by the phone's calendar. */
export function daysSince(iso: string, now = new Date()): number {
  const a = new Date(iso)
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((day(now) - day(a)) / 864e5)
}

type Taker = (account: number, cents: number) => void
/** The Catch up screens open now, newest last, each ready to take a missing entry from Reconcile. */
export const useCatchUpHandoff = create<{ takers: Taker[] }>(() => ({ takers: [] }))

/** Registers an open Catch up; returns the cleanup. */
export function offerCatchUp(take: Taker): () => void {
  useCatchUpHandoff.setState((s) => ({ takers: [...s.takers, take] }))
  return () => useCatchUpHandoff.setState((s) => ({ takers: s.takers.filter((x) => x !== take) }))
}

/** Reconcile found a gap the size of one missing entry: the Catch up it was opened from (under it) starts that entry.
 *  False when none is open, and Reconcile opens one itself. */
export function handToCatchUp(account: number, cents: number): boolean {
  const take = useCatchUpHandoff.getState().takers.at(-1)
  take?.(account, cents)
  return !!take
}

export interface Stale { id: number; days: number; never?: true }

/** Accounts caught up before but not for `STALE_DAYS` or more, and (given `newest`, each account's newest entry date)
 *  accounts never caught up whose newest entry is `NEVER_DAYS` or more old, `never` and counted from that entry.
 *  Oldest first. An account with no entries isn't nagged about. */
export function staleAccounts(at: Record<string, string>, ids: number[], now = new Date(), newest: Record<string, string> = {}): Stale[] {
  return ids.flatMap((id): Stale[] => {
    const k = String(id)
    if (at[k]) { const days = daysSince(at[k], now); return days >= STALE_DAYS ? [{ id, days }] : [] }
    if (!newest[k]) return []
    const days = daysSince(fromISO(newest[k]).toISOString(), now)
    return days >= NEVER_DAYS ? [{ id, days, never: true }] : []
  }).sort((a, b) => b.days - a.days)
}
