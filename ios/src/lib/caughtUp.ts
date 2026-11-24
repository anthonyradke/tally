// When each account was last caught up (the weekly pass through the bank's list in Catch up), kept on the phone.
// Catch up shows it where the account left off, and Home nudges when one hasn't been caught up in a while.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { addDays, fromISO } from './dates'
import { scoped } from './server'

const KEY = 'tally.caughtUp'
const OFF_KEY = 'tally.catchUpOff'
/** Days after which Home suggests catching an account up. */
export const STALE_DAYS = 9
/** For an account never caught up: how old its newest entry gets before Home suggests it, so Catch up gets found. */
export const NEVER_DAYS = 7
/** An account with fewer entries a month than this isn't nudged about (savings that gets one transfer a month). */
export const MIN_PER_MONTH = 4
/** How far back an account's rhythm is read. */
const RHYTHM_DAYS = 90

/** `off`: accounts Home no longer suggests ("Not for this account" on the nudge). */
interface S { at: Record<string, string>; off: Record<string, true> } // account id → ISO time
export const useCaughtUp = create<S>(() => ({ at: {}, off: {} }))

const record = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null)
export async function loadCaughtUp() {
  try {
    const at = record(JSON.parse((await AsyncStorage.getItem(scoped(KEY))) ?? '{}'))
    useCaughtUp.setState({ at: (at ?? {}) as S['at'] })
  } catch { /* unreadable: start over */ }
  try {
    const off = record(JSON.parse((await AsyncStorage.getItem(scoped(OFF_KEY))) ?? '{}'))
    useCaughtUp.setState({ off: (off ?? {}) as S['off'] })
  } catch { /* unreadable: every account is suggested again */ }
}

const saveOff = (off: S['off']) => {
  useCaughtUp.setState({ off })
  AsyncStorage.setItem(scoped(OFF_KEY), JSON.stringify(off)).catch(() => {})
}
/** Home stops (`on` false) or starts again suggesting catching an account up. */
export function suggestCatchUp(accountId: number, on: boolean) {
  const off = { ...useCaughtUp.getState().off }
  if (on) delete off[String(accountId)]
  else off[String(accountId)] = true
  saveOff(off)
}

const save = (at: Record<string, string>) => {
  useCaughtUp.setState({ at })
  AsyncStorage.setItem(scoped(KEY), JSON.stringify(at)).catch(() => {})
}

/** Marks an account caught up (entries added in Catch up, a look through it with nothing to add, a reconcile that
 *  matched). Returns when it was before, for an Undo (undefined: never). */
export function markCaughtUp(accountId: number, when = new Date()): string | undefined {
  const k = String(accountId)
  const before = useCaughtUp.getState().at
  save({ ...before, [k]: when.toISOString() })
  return before[k]
}

/** Puts back what `markCaughtUp` replaced. */
export function unmarkCaughtUp(accountId: number, before: string | undefined) {
  const at = { ...useCaughtUp.getState().at }
  if (before) at[String(accountId)] = before
  else delete at[String(accountId)]
  save(at)
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

/** How often an account gets entries: a month's worth, and the median days between the days it has any. */
export interface Rhythm { perMonth: number; gap: number | null }

/** An account's rhythm from its entries' dates (scheduled ones are left out), over the last 90 days or since its first entry
 *  if that's later (at least a month). */
export function rhythmOf(dates: string[], today: string): Rhythm {
  const posted = dates.filter((x) => x <= today).sort()
  if (!posted.length) return { perMonth: 0, gap: null }
  const since = addDays(today, -RHYTHM_DAYS)
  const recent = posted.filter((x) => x > since)
  const span = Math.max(30, Math.min(RHYTHM_DAYS, daysBetween(posted[0], today)))
  const days = [...new Set(recent)]
  const gaps = days.slice(1).map((x, i) => daysBetween(days[i], x)).sort((a, b) => a - b)
  const gap = gaps.length ? (gaps[(gaps.length - 1) >> 1] + gaps[gaps.length >> 1]) / 2 : null
  return { perMonth: recent.length / (span / 30.44), gap }
}
const daysBetween = (a: string, b: string) => Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 864e5)

/** Days before an account counts as behind: `base`, or half again its usual gap between entries if that's longer. */
const limit = (base: number, r: Rhythm | undefined) => Math.max(base, r?.gap != null ? Math.ceil(r.gap * 1.5) : 0)

/** Accounts caught up before but not for `STALE_DAYS` or more, and (given `newest`, each account's newest entry date)
 *  accounts never caught up whose newest entry is `NEVER_DAYS` or more old, `never` and counted from that entry.
 *  Oldest first. An account with no entries isn't nagged about. Given its `rhythm`, an account is measured against
 *  its own pace (half again its usual gap, if that's longer), and one with under `MIN_PER_MONTH` entries a month isn't
 *  suggested at all: catching it up every week or so would be noise. */
export function staleAccounts(at: Record<string, string>, ids: number[], now = new Date(), newest: Record<string, string> = {},
  rhythm: Record<string, Rhythm> = {}): Stale[] {
  return ids.flatMap((id): Stale[] => {
    const k = String(id)
    const r = rhythm[k]
    if (r && r.perMonth < MIN_PER_MONTH) return []
    if (at[k]) { const days = daysSince(at[k], now); return days >= limit(STALE_DAYS, r) ? [{ id, days }] : [] }
    if (!newest[k]) return []
    const days = daysSince(fromISO(newest[k]).toISOString(), now)
    return days >= limit(NEVER_DAYS, r) ? [{ id, days, never: true }] : []
  }).sort((a, b) => b.days - a.days)
}
