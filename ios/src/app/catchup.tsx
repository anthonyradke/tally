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
import { balanceAfter, catchable, duplicateOf, flip, hintFor, lastShown, otherSide, queuedRows, sides, touches } from '@/lib/catchup'
import { exactPlace } from '@/lib/compose'
import { refreshCatchUp, useBankMatch, useCatchUpSession, useKeyboardBar } from '@/lib/catchupHooks'
import { offerCatchUp } from '@/lib/caughtUp'
import { useTransactions } from '@/lib/data'
import { renew, useDraftOwner } from '@/lib/draftOwner'
import { blank, fromCents, fromTxn, toCents, toInputs, useDraft } from '@/lib/draft'
import { formatCents } from '@/lib/money'
import { markFresh } from '@/lib/motion'
import { close, useBusy, useLatest } from '@/lib/nav'
import { sendOrQueue, useOutbox } from '@/lib/outbox'
import { Reveal } from '@/lib/privacy'
import { fits, HINT } from '@/lib/shapes'
import { play } from '@/lib/sound'
import { useTally } from '@/lib/tally'
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
  const [last, setLast] = useState<Last | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  // The figure is a suggestion the first key replaces: a past place's amount (`suggested`), or one typed before Back.
  const [fresh, setFresh] = useState(false)
  const [suggested, setSuggested] = useState(false)
  const [shakeStyle, shake] = useShake()
  /** The name the draft's amount and category were for, when going back to "What was it?": a new name clears them. */
  const filledFor = useRef<string | null>(null)
  /** The amount came from Reconcile: picking a place keeps it. */
  const handed = useRef(!!amount)
  const [missing, setMissing] = useState(amount ?? null) // said on "What was it?", so it's clear why it's there
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

  const ledger = useCatchUpSession(acct, t.b?.start, today)
  const { mine, session, running, balance, gone } = ledger
  const count = mine.length
  const bank = useBankMatch(busy)
  const shown = lastShown(last, ledger.live, running)
  const outbox = useOutbox((s) => s.items)
  const waiting = useMemo(() => queuedRows(outbox), [outbox])

  const recent = useTransactions({ account: acct?.id, end: today, limit: RECENT + count }, !!acct && !!today)
  // Only this account's own rows: a list still showing the last account's while the new one loads would mislead.
  const rows = (recent.data?.items ?? []).filter((x) => touches(x, acct?.id ?? -1))
  // The first line starts on the account's newest entry, so it waits for this account's list (not the last one's).
  const ready = !!recent.data && !recent.isPlaceholderData

  // The draft store is shared with the composer: start clean, before the first paint.
  useLayoutEffect(() => { if (today) reset({ ...blank(today), amount: amount ? fromCents(amount) : '' }) }, [!!today]) // eslint-disable-line react-hooks/exhaustive-deps
  // Opened on an account (Home's nudge, its page) and closed with nothing to add: it was looked through, so it counts.
  useEffect(() => { if (account != null) ledger.touched(account) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const cents = toCents(d.amount)
  const after = useMemo(() => acct && ledger.rows && t.b
    ? balanceAfter(acct, ledger.rows, t.b.start, { ...toInputs(d)[0], date: d.date }, d.category_id != null) : null, [t.b, acct, ledger.rows, d])

  const go = (p: Page, way: 1 | -1) => {
    Haptics.selectionAsync().catch(() => {}); Keyboard.dismiss(); setErrors([]); setDir(way); setPage(p)
  }
  const clearLine = () => { filledFor.current = null; handed.current = false; setMissing(null); setFresh(false); setSuggested(false) }
  const refuse = () => { shake(); play('error', 0.6); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}) }
  // Not while it saves or draws its check: the row just added is in the ledger by then, and would be its own lookalike
  // (with a Skip that dropped its Undo).
  const lookalike = acct && cents && page === 'amount' && !saving && !done
    ? duplicateOf([...(ledger.rows ?? [...ledger.live, ...(history.data?.items ?? [])]), ...waiting], { date: d.date, amount: cents * (d.refund ? -1 : 1), what: d.what },
      acct.id, (id) => gone.has(id), fresh && suggested)
    : null

  // A new line keeps the day of the last one on this account (a bank's list goes day by day); the first one starts on
  // the day of the account's newest entry, where the bank's list picks up.
  const start = () => {
    if (!ready) return
    ledger.touched(acct!.id) // gone through with nothing to add still counts as caught up
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
      const match = exactPlace(historyRows, d.what, undefined, (x) => touches(x, acct!.id)) // as it went on this account, if it did
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
  // The lookalike was the one: nothing to add, on to the next line on the same day. The top line says it was skipped.
  const skip = () => {
    setLast({ row: null, label: d.what || lookalike?.what || 'it', cents, skipped: true })
    reset({ ...blank(d.date), date: d.date }); clearLine(); go('what', 1)
  }
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
        ledger.remember(saved)
        setLast({ row: saved[0], label, cents, after: then })
        bank.unmatch(acct.id) // a new entry changes the balance the bank agreed with
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
        play('tick')
        ledger.queue()
        setLast({ row: null, label, cents })
      }
      ledger.touched(acct.id)
      days.current.set(acct.id, d.date)
      refreshCatchUp()
      setDone(true) // the button draws its check, then the next entry slides in
      await new Promise((r) => setTimeout(r, 420))
      setDone(false)
      renew({ ...blank(d.date), date: d.date }, owner) // an editor opened meanwhile keeps its draft
      clearLine()
      go('what', 1)
    } catch (e) {
      setErrors(e instanceof ApiError ? e.errors : ['Tally is unreachable. Check Tailscale and try again.'])
      refuse()
    } finally {
      setSaving(false)
    }
  }
  // Undo takes the entry back out and brings its values back on its amount page, to fix and add again (or leave).
  const undo = () => busy(undoNow) // tapped twice, the second used to say "Not Found" after the first had worked
  async function undoNow() {
    const row = shown?.row
    if (!row) return
    const cur = ledger.live.find((x) => x.id === row.id) ?? row
    try {
      // Already deleted elsewhere (the session list, the editor) is as good as taken back.
      await api.deleteTxn(row.id).catch((e) => { if (!(e instanceof ApiError && e.status === 404)) throw e })
      play('remove')
      Haptics.selectionAsync().catch(() => {})
      ledger.forget(row.id)
      setLast(null)
      refreshCatchUp()
      clearLine()
      renew({ ...fromTxn(cur, t.catOf(cur).type), id: undefined }, owner)
      go('amount', -1)
    } catch (e) {
      setLast({ ...shown!, error: e instanceof ApiError ? e.errors.join(' ') : "Couldn't undo: Tally is unreachable." })
    }
  }

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
    setMissing(gap)
    reset({ ...blank(t.today), amount: fromCents(gap) })
    go('what', 1)
  })
  useEffect(() => offerCatchUp((id, gap) => take.current(id, gap)), [take])

  const barStyle = useKeyboardBar()
  if (!t.b || !acct) return <View style={{ flex: 1, backgroundColor: c.bg }} />

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1 }}>
        <Pages page={page} dir={dir} render={(p) => (
          p === 'list' ? <LeftOff accounts={list} acct={acct} onAcct={(id) => { setPicked(id); setLast(null) }} rows={rows} loading={recent.isLoading} added={count}
              session={session} running={running} balance={balance} matched={!!bank.matched[acct.id]} onMatch={() => { if (balance != null) bank.match(acct, balance) }}
              onCheck={() => { Haptics.selectionAsync().catch(() => {}); router.push(`/reconcile/${acct.id}`) }} />
          : p === 'what' ? <What acct={acct} history={historyRows} count={count} last={shown} missing={missing} onUndo={undo} onPick={pickPast} onSubmit={next} onCount={openSession} />
          : p === 'amount' ? <Amount acct={acct} history={historyRows} count={count} lookalike={lookalike} errors={errors} shake={shakeStyle} after={after}
              fresh={fresh} suggested={suggested} onTyped={() => { setFresh(false); setSuggested(false) }}
              onWhat={toWhat} onCategory={(id) => pickCategory(id, false)} onMoreCategories={() => go('category', 1)}
              onOther={() => go('other', 1)} onFlip={() => { Haptics.selectionAsync().catch(() => {}); set(flip(d)) }} onRefuse={refuse}
              onSkip={skip} onCount={openSession} />
          : p === 'category' ? <Categories onPick={(id) => pickCategory(id, true)} />
          : p === 'session' ? <Session acct={acct} rows={mine} running={running} />
          : <Other acct={acct} onPick={pickOther} />
        )} />
      </View>
      <Bar style={barStyle} back={page === 'list' ? undefined : { label: page === 'what' && (count || shown) ? 'Done' : 'Back', onPress: back }}
        action={page === 'list' ? { label: `Add to ${acct.name}`, onPress: start, disabled: !ready }
          : page === 'what' ? { label: 'Next', onPress: next }
          : page === 'session' ? null
          : page !== 'amount' ? 'blank'
          : done ? 'added' : { label: saving ? 'Adding…' : `Add ${formatCents(cents)}`, onPress: add, disabled: saving }} />
      <Confetti fire={bank.party} origin={{ x: 0.5, y: 0.3 }} />
    </View>
  )
}
