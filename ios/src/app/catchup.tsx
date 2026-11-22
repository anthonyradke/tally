// Catching up an account: once a week or so, go down the bank's list and add everything since the last entry in
// Tally, without leaving. The account stays put, the day stays from one entry to the next, and each Add saves at once
// (through the outbox) and starts the next one. The first page shows where the account left off and, once entries
// are in, its balance to check against the bank's. Opened from Activity, an account's page, Reconcile (a gap the size
// of one missing entry, `amount` in cents) or the composer (as one of its pages, `embedded`).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Amount, Bar, Categories, Other, What, type Last } from '@/components/CatchUpPages'
import { LeftOff, Session } from '@/components/CatchUpStart'
import { Confetti } from '@/components/Confetti'
import { Pages } from '@/components/Pages'
import { useShake } from '@/components/Shake'
import { merchantKey } from '@/icons/merchants'
import { api, ApiError, type Txn } from '@/lib/api'
import { catchable, exactPlace, flip, hintFor, lookalikes, otherSide, sides, touches } from '@/lib/catchup'
import { useKeyboardBar, useSessionLedger, type Added } from '@/lib/catchupHooks'
import { balanceOn, effect } from '@/lib/balances'
import { markCaughtUp, offerCatchUp } from '@/lib/caughtUp'
import { invalidateAll, queryClient, useTransactions } from '@/lib/data'
import { useDraftOwner } from '@/lib/draftOwner'
import { blank, fromCents, fromTxn, toCents, toInputs, useDraft } from '@/lib/draft'
import { formatCents } from '@/lib/money'
import { markFresh } from '@/lib/motion'
import { close, useBusy, useLatest } from '@/lib/nav'
import { sendOrQueue } from '@/lib/outbox'
import { Reveal } from '@/lib/privacy'
import { toastReconciled } from '@/lib/reconciled'
import { fits, HINT } from '@/lib/shapes'
import { play } from '@/lib/sound'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { useTheme } from '@/theme'

type Page = 'list' | 'what' | 'amount' | 'category' | 'other' | 'session'
const RECENT = 8

// One element for good, so the X is never rebuilt under a tap (see useLatest in lib/nav).
const HEADER = (
  <>
    <Stack.Screen options={{ title: 'Catch up' }} />
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Close" onPress={() => { Keyboard.dismiss(); close() }} />
    </Stack.Toolbar>
  </>
)

export default function CatchUpRoute() {
  const { account, amount } = useLocalSearchParams<{ account?: string; amount?: string }>()
  return (
    <Reveal.Provider value>
      {HEADER}
      <CatchUp account={account ? Number(account) : undefined} amount={amount ? Number(amount) || undefined : undefined} />
    </Reveal.Provider>
  )
}

export function CatchUp({ account, amount }: { account?: number; amount?: number }) {
  const { c } = useTheme()
  const t = useTally()
  const { d, set, reset: resetDraft } = useDraft()
  const owner = useDraftOwner()
  const reset = (x: Parameters<typeof resetDraft>[0]) => resetDraft(x, owner)
  const busy = useBusy()
  const [picked, setPicked] = useState<number | undefined>(account)
  const [page, setPage] = useState<Page>(amount ? 'what' : 'list')
  const [dir, setDir] = useState<1 | -1>(1)
  const [from, setFrom] = useState<Page>('what') // where the session list goes back to
  const [added, setAdded] = useState<Added[]>([])
  const [queued, setQueued] = useState(0)
  const [last, setLast] = useState<Last | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  // The figure is a suggestion the first key replaces: a past place's amount (`suggested`), or one typed before Back.
  const [fresh, setFresh] = useState(false)
  const [suggested, setSuggested] = useState(false)
  const [matched, setMatched] = useState<Record<number, boolean>>({}) // accounts reconciled here
  const [party, setParty] = useState(0)
  const [shakeStyle, shake] = useShake()
  /** The name the draft's amount and category were for, when going back to "What was it?": a new name clears them. */
  const filledFor = useRef<string | null>(null)
  /** The amount came from Reconcile: picking a place keeps it. */
  const handed = useRef(!!amount)
  /** The day each account's entries are on, so switching accounts doesn't carry one's day to the other. */
  const days = useRef(new Map<number, string>())

  const today = t.b ? t.today : undefined
  const list = useMemo(() => {
    const all = t.b ? catchable(t.b.accounts) : []
    const extra = picked != null && !all.some((a) => a.id === picked) ? t.acct.get(picked) : undefined // e.g. the HSA's own page
    return extra ? [extra, ...all] : all
  }, [t.b, t.acct, picked])
  const acct = list.find((a) => a.id === picked) ?? list[0]
  const history = useTransactions({ limit: 600 }, !!t.b)
  // Suggestions come from what has happened: scheduled rows (a weekly bill posted weeks ahead) used to fill "Usual
  // on…". Lookalikes still check them, since a scheduled bill is a likely duplicate.
  const historyRows = useMemo(() => (history.data?.items ?? []).filter((x) => !today || x.date <= today), [history.data, today])

  const ledger = useSessionLedger(added, acct, t.b?.start, today)
  const { mine, session, running, balance } = ledger
  const count = mine.length

  const recent = useTransactions({ account: acct?.id, end: today, limit: RECENT + count }, !!acct && !!today)
  // Only this account's own rows: a list still showing the last account's while the new one loads would mislead.
  const rows = (recent.data?.items ?? []).filter((x) => touches(x, acct?.id ?? -1))

  // The draft store is shared with the composer: start clean, before the first paint.
  useLayoutEffect(() => { if (today) reset({ ...blank(today), amount: amount ? fromCents(amount) : '' }) }, [!!today]) // eslint-disable-line react-hooks/exhaustive-deps
  // Closing after adding some: one line on Home or Activity says how many, every list refreshes (each Add only
  // refreshed what Catch up shows, not the full list behind Accounts), and each account touched counts as caught up.
  const tally = useRef({ added: 0, queued: 0, accounts: new Set<number>() })
  useEffect(() => { tally.current = { ...tally.current, added: ledger.live.length, queued } }, [ledger.live.length, queued])
  useEffect(() => () => {
    const n = tally.current.added + tally.current.queued
    tally.current.accounts.forEach((id) => markCaughtUp(id))
    if (n) {
      invalidateAll().catch(() => {})
      toast({ text: `Caught up: ${n === 1 ? '1 entry' : `${n} entries`} added${tally.current.queued ? `, ${tally.current.queued} waiting for Tailscale` : ''}` })
    }
  }, [])

  const cents = toCents(d.amount)
  // The account's balance once this entry is in, on its day, to check against the bank's running balance. Before a
  // category says which way it goes, it counts as money out.
  const after = useMemo(() => {
    if (!t.b || !acct || !ledger.rows || (acct.kind !== 'cash' && acct.kind !== 'card')) return null
    const line = toInputs(d)[0]
    const way = d.category_id ? line : { from_id: acct.id, to_id: null, amount: line.amount }
    return balanceOn(acct, ledger.rows, t.b.start, d.date) + (cents ? effect(acct, way) : 0)
  }, [t.b, acct, ledger.rows, d, cents])

  const go = (p: Page, way: 1 | -1) => {
    Haptics.selectionAsync().catch(() => {})
    Keyboard.dismiss()
    setErrors([])
    setDir(way)
    setPage(p)
  }
  const clearLine = () => { filledFor.current = null; handed.current = false; setFresh(false); setSuggested(false) }
  const refuse = () => { shake(); play('error', 0.6); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}) }
  const lookalike = acct && cents && page === 'amount'
    ? lookalikes(history.data?.items ?? [], { date: d.date, amount: cents * (d.refund ? -1 : 1) }, acct.id).find((x) => !session.has(x.id)) ?? null
    : null

  // A new line keeps the day of the last one on this account (a bank's list goes day by day); the first one starts on
  // the day of the account's newest entry, where the bank's list picks up.
  const start = () => {
    const day = days.current.get(acct!.id) ?? rows[0]?.date ?? today!
    reset({ ...blank(day), date: day })
    setLast(null)
    clearLine()
    go('what', 1)
  }
  // A past place copies its category, accounts and last amount; the amount is only a suggestion the first key replaces.
  // An amount from Reconcile stays, and so does one typed for this same place before going back (to be replaced too).
  const pickPast = (x: Txn) => {
    const kind = t.catOf(x).type
    const same = filledFor.current != null && merchantKey(filledFor.current) === merchantKey(x.what)
    const keep = !!d.amount && (handed.current || same)
    filledFor.current = null
    set({ what: x.what, category_id: x.category_id, kind, refund: false, ...sides(kind, acct!.id, x), ...(keep ? {} : { amount: x.amount ? fromCents(x.amount) : '' }) })
    setFresh(keep ? !handed.current : !!x.amount)
    setSuggested(!keep && !!x.amount)
    go('amount', 1)
  }
  // Next (or Return) on "What was it?". A name that's exactly a known place copies it, as a tap would. Back from the
  // amount, a new name starts the line over (it isn't the same entry any more); the same name keeps the figure, which
  // the first key then replaces.
  const next = () => {
    const before = filledFor.current
    filledFor.current = null
    const renamed = before != null && merchantKey(before) !== merchantKey(d.what)
    if (before == null || renamed) {
      const match = exactPlace(historyRows, acct!.id, d.what)
      if (match) { pickPast(match); return }
    }
    if (renamed) {
      set({ amount: handed.current ? d.amount : '', category_id: null, kind: 'Spending', refund: false, from_id: null, to_id: null })
      setFresh(false)
      setSuggested(false)
    } else if (before != null && d.amount) setFresh(true)
    go('amount', 1)
  }
  const toWhat = () => { filledFor.current = d.what; go('what', -1) }
  // A category on its own starts the way it went last time on this account (a card payment onto the card).
  const pickCategory = (id: number, back: boolean) => {
    const cat = t.cat.get(id)
    if (!cat) return
    const hint = id === d.category_id ? d : hintFor(historyRows, acct!, id, cat.type, d)
    set({ category_id: id, kind: cat.type, refund: cat.type === 'Spending' && d.refund, ...sides(cat.type, acct!.id, hint) })
    setErrors([])
    if (back) go('amount', -1)
  }
  const pickOther = (id: number | null) => {
    set(otherSide(d, acct!.id).side === 'from' ? { from_id: id } : { to_id: id })
    go('amount', -1)
  }
  // The lookalike was the one: nothing to add, on to the next line on the same day.
  const skip = () => { reset({ ...blank(d.date), date: d.date }); clearLine(); go('what', 1) }
  const openSession = () => { setFrom(page); go('session', 1) }

  const add = () => busy(addNow) // a second tap while one is saving does nothing
  async function addNow() {
    if (!acct) return
    const lines = toInputs(d)
    const errs: string[] = []
    if (!cents) errs.push('Enter an amount.')
    if (!d.category_id) errs.push('Pick a category.')
    else if (!fits(lines[0], d.kind)) errs.push(HINT[d.kind])
    if (errs.length) { setErrors(errs); refuse(); return }
    setSaving(true)
    const label = d.what || t.cat.get(d.category_id!)?.name || 'Entry'
    const then = after != null ? { cents: after, date: d.date } : null
    try {
      const saved = await sendOrQueue(lines, label)
      if (saved) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        play(d.kind === 'Money in' ? 'income' : 'add')
        markFresh(saved.map((x) => x.id))
        const at = ledger.version
        setAdded((a) => [...a, ...saved.map((x) => ({ ...x, at }))])
        setLast({ row: saved[0], label, cents, after: then })
        setMatched((m) => ({ ...m, [acct.id]: false })) // a new entry changes the balance the bank agreed with
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
        play('tick')
        setQueued((n) => n + 1)
        setLast({ row: null, label, cents })
      }
      tally.current.accounts.add(acct.id)
      days.current.set(acct.id, d.date)
      refreshHere()
      setDone(true) // the button draws its check, then the next entry slides in
      await new Promise((r) => setTimeout(r, 420))
      setDone(false)
      reset({ ...blank(d.date), date: d.date })
      clearLine()
      go('what', 1)
    } catch (e) {
      setErrors(e instanceof ApiError ? e.errors : ['Tally is unreachable. Check Tailscale and try again.'])
      refuse()
    } finally {
      setSaving(false)
    }
  }
  // Only what Catch up shows: the bootstrap and its own two lists. The rest refreshes when it closes.
  const refreshHere = () => {
    queryClient.invalidateQueries({ queryKey: ['bootstrap'] }).catch(() => {})
    queryClient.invalidateQueries({ queryKey: ['transactions'], predicate: (q) => {
      const k = q.queryKey[1] as { limit?: number; account?: number; end?: string } | undefined
      return k?.limit === 600 || (k?.account != null && k?.end != null && k.limit != null && k.limit < 1000)
    } }).catch(() => {})
  }
  // Undo takes the entry back out and brings its values back on its amount page, to fix and add again (or leave).
  const undo = () => busy(undoNow) // tapped twice, the second used to say "Not Found" after the first had worked
  async function undoNow() {
    const row = last?.row
    if (!row) return
    const cur = ledger.live.find((x) => x.id === row.id) ?? row
    try {
      await api.deleteTxn(row.id)
      play('remove')
      Haptics.selectionAsync().catch(() => {})
      setAdded((a) => a.filter((x) => x.id !== row.id))
      setLast(null)
      refreshHere()
      clearLine()
      reset({ ...fromTxn(cur, t.catOf(cur).type), id: undefined })
      go('amount', -1)
    } catch (e) {
      setLast({ ...last!, error: e instanceof ApiError ? e.errors.join(' ') : "Couldn't undo: Tally is unreachable." })
    }
  }
  // "Bank says the same": Tally's balance today saved as a reconciliation, with Undo.
  const match = () => busy(async () => {
    if (!acct || balance == null) return
    const a = acct
    try {
      const r = await api.reconcile(a.id, balance, true)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      play('success')
      setParty((n) => n + 1)
      setMatched((m) => ({ ...m, [a.id]: true }))
      toastReconciled(a.name, r, () => setMatched((m) => ({ ...m, [a.id]: false })))
    } catch (e) {
      toast({ text: e instanceof ApiError ? e.errors.join(' ') : 'Tally is unreachable.', tone: 'error' })
    }
  })

  const back = () => {
    if (page === 'amount') { toWhat(); return }
    if (page === 'what' && acct) days.current.set(acct.id, d.date)
    go(page === 'what' ? 'list' : page === 'session' ? from : 'amount', -1)
  }

  // Reconcile, opened from here, hands back a missing entry's amount: it starts as the next entry, on today.
  const take = useLatest((id: number, gap: number) => {
    setPicked(id)
    setLast(null)
    clearLine()
    handed.current = true
    reset({ ...blank(t.today), amount: fromCents(gap) })
    go('what', 1)
  })
  useEffect(() => offerCatchUp((id, gap) => take.current(id, gap)), [take])

  const barStyle = useKeyboardBar()
  if (!t.b || !acct) return <View style={{ flex: 1, backgroundColor: c.bg }} />
  const sessionRows = [...mine].sort((x, z) => (x.date < z.date ? 1 : x.date > z.date ? -1 : z.id - x.id))

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1 }}>
        <Pages page={page} dir={dir} render={(p) => (
          p === 'list' ? <LeftOff accounts={list} acct={acct} onAcct={(id) => { setPicked(id); setLast(null) }} rows={rows} loading={recent.isLoading} added={count}
              session={session} running={running} balance={balance} matched={!!matched[acct.id]} onMatch={match}
              onCheck={() => { Haptics.selectionAsync().catch(() => {}); router.push(`/reconcile/${acct.id}`) }} />
          : p === 'what' ? <What acct={acct} history={historyRows} count={count} last={last} onUndo={undo} onPick={pickPast} onSubmit={next} onCount={openSession} />
          : p === 'amount' ? <Amount acct={acct} history={historyRows} count={count} lookalike={lookalike} errors={errors} shake={shakeStyle} after={after}
              fresh={fresh} suggested={suggested} onTyped={() => { setFresh(false); setSuggested(false) }}
              onWhat={toWhat} onCategory={(id) => pickCategory(id, false)} onMoreCategories={() => go('category', 1)}
              onOther={() => go('other', 1)} onFlip={() => { Haptics.selectionAsync().catch(() => {}); set(flip(d)) }} onRefuse={refuse}
              onSkip={skip} onCount={openSession} />
          : p === 'category' ? <Categories onPick={(id) => pickCategory(id, true)} />
          : p === 'session' ? <Session acct={acct} rows={sessionRows} running={running} />
          : <Other acct={acct} onPick={pickOther} />
        )} />
      </View>
      <Bar style={barStyle} back={page === 'list' ? undefined : { label: page === 'what' && (count || last) ? 'Done' : 'Back', onPress: back }}
        action={page === 'list' ? { label: `Add to ${acct.name}`, onPress: start }
          : page === 'what' ? { label: 'Next', onPress: next }
          : page === 'session' ? null
          : page !== 'amount' ? 'blank'
          : done ? 'added' : { label: saving ? 'Adding…' : `Add ${formatCents(cents)}`, onPress: add, disabled: saving }} />
      <Confetti fire={party} origin={{ x: 0.5, y: 0.3 }} />
    </View>
  )
}
