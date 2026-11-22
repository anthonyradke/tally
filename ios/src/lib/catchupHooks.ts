// Catch up's screen-level pieces (app/catchup.tsx): the rows it works from, with this session's in them, and the
// Back / Next bar that rides the keyboard.
import { useEffect, useMemo } from 'react'
import { Keyboard } from 'react-native'
import { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { space } from '@/theme'
import type { Account, Txn } from './api'
import { balanceOn, useAllTxns } from './balances'
import { runningBalances, touches } from './catchup'

const KEYBOARD = Easing.bezier(0.38, 0.7, 0.125, 1)

/** A row a catch-up added, with the full list's version (`dataUpdatedAt`) when it did. */
export type Added = Txn & { at: number }

/** Every row with the session's in it, before the full list refreshes (each Add refreshes only Catch up's own lists),
 *  and, for the account: what the session added to it (`mine`, current versions), the balance after each row and
 *  today's. A session row missing from a list fetched after it was added was deleted elsewhere (a swipe in the
 *  session list, the editor). */
export function useSessionLedger(added: Added[], acct: Account | undefined, start: string | undefined, today: string | undefined) {
  const all = useAllTxns(!!start)
  const at = all.dataUpdatedAt
  const ledger = useMemo(() => {
    if (!all.data) return { rows: null, live: added as Txn[] }
    const byId = new Map(all.data.items.map((x) => [x.id, x]))
    const live = added.filter((x) => byId.has(x.id) || at <= x.at).map((x) => byId.get(x.id) ?? x)
    return { rows: [...all.data.items, ...live.filter((x) => !byId.has(x.id))], live }
  }, [all.data, at, added])
  const daily = acct?.kind === 'cash' || acct?.kind === 'card'
  return useMemo(() => {
    const mine = acct ? ledger.live.filter((x) => touches(x, acct.id)) : []
    const ok = !!(acct && daily && ledger.rows && start)
    return {
      ...ledger,
      version: at,
      mine,
      session: new Set(ledger.live.map((x) => x.id)),
      running: ok ? runningBalances(acct!, ledger.rows!, start!) : null,
      balance: ok && today ? balanceOn(acct!, ledger.rows!, start!, today) : null,
    }
  }, [ledger, at, acct, daily, start, today])
}

/** The bar's bottom padding: above the keyboard while a name is being typed (on the keyboard's own timing, as in the
 *  composer), above the home indicator otherwise. */
export function useKeyboardBar() {
  const insets = useSafeAreaInsets()
  const reduce = useReducedMotion()
  const kb = useSharedValue(0)
  useEffect(() => {
    const to = (h: number, ms?: number) => kb.set(reduce ? h : withTiming(h, { duration: ms || 250, easing: KEYBOARD }))
    const show = Keyboard.addListener('keyboardWillShow', (e) => to(e.endCoordinates.height, e.duration))
    const hide = Keyboard.addListener('keyboardWillHide', (e) => to(0, e.duration))
    return () => { show.remove(); hide.remove() }
  }, [reduce]) // eslint-disable-line react-hooks/exhaustive-deps
  const bottom = insets.bottom
  return useAnimatedStyle(() => ({ paddingBottom: Math.max(kb.get(), bottom) + space.s }))
}
