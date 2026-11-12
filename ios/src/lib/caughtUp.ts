// When each account was last caught up (the weekly pass through the bank's list in Catch up), kept on the phone.
// Catch up shows it where the account left off, and Home nudges when one hasn't been caught up in a while.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'

const KEY = 'tally.caughtUp'
/** Days after which Home suggests catching an account up. */
export const STALE_DAYS = 9

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

/** Accounts caught up before but not for `STALE_DAYS` or more, oldest first. Never-caught-up ones aren't nagged about. */
export function staleAccounts(at: Record<string, string>, ids: number[], now = new Date()): { id: number; days: number }[] {
  return ids.flatMap((id) => (at[String(id)] ? [{ id, days: daysSince(at[String(id)], now) }] : []))
    .filter((x) => x.days >= STALE_DAYS).sort((a, b) => b.days - a.days)
}
