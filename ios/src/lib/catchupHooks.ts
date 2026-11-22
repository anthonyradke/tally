// Catch up's screen-level pieces (app/catchup.tsx): the session (what it added, and the rows it works from with those
// in them), "Bank says the same", and the Back / Next bar that rides the keyboard.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard } from 'react-native'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { space } from '@/theme'
import { api, ApiError, type Account, type Txn } from './api'
import { ALL_TXNS, balanceOn, balanceWords, useAllTxns } from './balances'
import { runningBalances, sessionRows, touches, type Added } from './catchup'
import { markCaughtUp } from './caughtUp'
import { invalidateAll, queryClient } from './data'
import { toastReconciled } from './reconciled'
import { play } from './sound'
import { toast } from './toast'

const KEYBOARD = Easing.bezier(0.38, 0.7, 0.125, 1)
const ALL_KEY = ['transactions', ALL_TXNS]

/** Only what Catch up shows: the bootstrap and its own lists (places, the account's newest). The rest, the full list
 *  behind Accounts included, refreshes when it closes. */
export function refreshCatchUp() {
  queryClient.invalidateQueries({ queryKey: ['bootstrap'] }).catch(() => {})
  queryClient.invalidateQueries({ queryKey: ['transactions'], predicate: (q) => {
    const k = q.queryKey[1] as { limit?: number; account?: number; end?: string } | undefined
    return k?.limit === 600 || (k?.account != null && k?.end != null && k.limit != null && k.limit < 1000)
  } }).catch(() => {})
}

/** What a catch-up added, and every row with those in them before the full list refreshes (each Add refreshes only
 *  Catch up's own lists); for the account, what the session added to it (`mine`), the balance after each row and
 *  today's. Closing after adding some says how many on Home or Activity, refreshes every list, and marks each account
 *  it went through (`touched`) as caught up. */
export function useCatchUpSession(acct: Account | undefined, start: string | undefined, today: string | undefined) {
  const [added, setAdded] = useState<Added[]>([])
  const [gone, setGone] = useState<ReadonlySet<number>>(() => new Set())
  const [queued, setQueued] = useState(0)
  const all = useAllTxns(!!start)
  const at = all.dataUpdatedAt
  const ledger = useMemo(() => {
    const version = queryClient.getQueryState(ALL_KEY)?.dataUpdateCount ?? 0
    return sessionRows(added, all.data?.items, version, gone)
  }, [all.data, at, added, gone]) // eslint-disable-line react-hooks/exhaustive-deps

  const closing = useRef({ added: 0, queued: 0, accounts: new Set<number>() })
  useEffect(() => { closing.current.added = ledger.live.length; closing.current.queued = queued }, [ledger.live.length, queued])
  useEffect(() => () => {
    const { added: n0, queued: q, accounts } = closing.current
    accounts.forEach((id) => markCaughtUp(id))
    const n = n0 + q
    if (n) {
      invalidateAll().catch(() => {})
      toast({ text: `Caught up: ${n === 1 ? '1 entry' : `${n} entries`} added${q ? `, ${q} waiting for Tailscale` : ''}` })
    }
  }, [])

  const daily = acct?.kind === 'cash' || acct?.kind === 'card'
  const derived = useMemo(() => {
    const ok = !!(acct && daily && ledger.rows && start)
    return {
      mine: acct ? ledger.live.filter((x) => touches(x, acct.id)) : [],
      session: new Set(ledger.live.map((x) => x.id)),
      running: ok ? runningBalances(acct!, ledger.rows!, start!) : null,
      balance: ok && today ? balanceOn(acct!, ledger.rows!, start!, today) : null,
    }
  }, [ledger, acct, daily, start, today])

  return {
    ...ledger, ...derived, gone,
    /** Saved rows. The full list must have them from its next version on, or the one after if a fetch was already on
     *  its way (it may have read the database before they went in). */
    remember: (rows: Txn[]) => {
      const s = queryClient.getQueryState(ALL_KEY)
      const by = (s?.dataUpdateCount ?? 0) + (s?.fetchStatus === 'fetching' ? 1 : 0)
      setAdded((a) => [...a, ...rows.map((x) => ({ ...x, by }))])
    },
    /** A row the session took back (Undo): out at once, even from a full list fetched before it went. */
    forget: (id: number) => setGone((g) => new Set(g).add(id)),
    queue: () => setQueued((n) => n + 1),
    touched: (id: number) => { closing.current.accounts.add(id) },
  }
}

/** "Bank says the same": Tally's balance today saved as a reconciliation, with Undo. It's checked against the server
 *  first, since the balance on screen could be behind it; then nothing is saved, and the balance refreshes. */
export function useBankMatch(busy: <T>(fn: () => Promise<T>) => Promise<T | undefined>) {
  const [matched, setMatched] = useState<Record<number, boolean>>({}) // accounts reconciled here
  const [party, setParty] = useState(0)
  const set = (id: number, on: boolean) => setMatched((m) => ({ ...m, [id]: on }))
  const match = (a: Account, balance: number) => busy(async () => {
    try {
      const shown = await api.reconcile(a.id, balance, false)
      if (shown.gap !== 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
        play('tick')
        invalidateAll().catch(() => {})
        toast({ text: `Tally has ${balanceWords(shown.expected, a.kind)} on ${a.name} now, not ${balanceWords(balance, a.kind)}. Nothing saved.`,
          action: { label: 'Reconcile', run: () => router.push(`/reconcile/${a.id}`) } })
        return
      }
      const r = await api.reconcile(a.id, balance, true)
      if (r.gap === 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        play('success')
        setParty((n) => n + 1)
        set(a.id, true)
      }
      toastReconciled(a, r, () => set(a.id, false))
    } catch (e) {
      toast({ text: e instanceof ApiError ? e.errors.join(' ') : 'Tally is unreachable.', tone: 'error' })
    }
  })
  return { matched, party, match, unmatch: (id: number) => set(id, false) }
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
