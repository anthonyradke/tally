// Catching up an account: once a week or so, go down the bank's list and add everything since the last entry in
// Tally, without leaving. The account stays put, the day stays from one entry to the next, and each Add saves at once
// (through the outbox) and starts the next one. The first page shows where the account left off.
// Opened from Activity, an account's page, or the composer (as one of its pages, `embedded`).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { CheckDraw } from '@/components/CheckDraw'
import { Amount, Categories, LeftOff, Other, What, type Last } from '@/components/CatchUpPages'
import { Pages } from '@/components/Pages'
import { useShake } from '@/components/Shake'
import { Button } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { api, ApiError, type Txn } from '@/lib/api'
import { catchable, flip, lookalikes, otherSide, sides } from '@/lib/catchup'
import { invalidateAll, useTransactions } from '@/lib/data'
import { blank, toCents, toInputs, useDraft } from '@/lib/draft'
import { formatCents } from '@/lib/money'
import { markFresh } from '@/lib/motion'
import { close } from '@/lib/nav'
import { sendOrQueue } from '@/lib/outbox'
import { Reveal } from '@/lib/privacy'
import { fits, HINT } from '@/lib/shapes'
import { play } from '@/lib/sound'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { radius, space, useTheme } from '@/theme'

type Page = 'list' | 'what' | 'amount' | 'category' | 'other'
const KEYBOARD = Easing.bezier(0.38, 0.7, 0.125, 1)

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
  const { account } = useLocalSearchParams<{ account?: string }>()
  return (
    <Reveal.Provider value>
      {HEADER}
      <CatchUp account={account ? Number(account) : undefined} />
    </Reveal.Provider>
  )
}

export function CatchUp({ account }: { account?: number }) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const t = useTally()
  const { d, set, reset } = useDraft()
  const [picked, setPicked] = useState<number | undefined>(account)
  const [page, setPage] = useState<Page>('list')
  const [dir, setDir] = useState<1 | -1>(1)
  const [added, setAdded] = useState<Txn[]>([])
  const [queued, setQueued] = useState(0)
  const [last, setLast] = useState<Last | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [shakeStyle, shake] = useShake()

  const today = t.b?.today
  const list = useMemo(() => {
    const all = t.b ? catchable(t.b.accounts) : []
    const extra = picked != null && !all.some((a) => a.id === picked) ? t.acct.get(picked) : undefined // e.g. the HSA's own page
    return extra ? [extra, ...all] : all
  }, [t.b, t.acct, picked])
  const acct = list.find((a) => a.id === picked) ?? list[0]
  const history = useTransactions({ limit: 600 }, !!t.b)
  const recent = useTransactions({ account: acct?.id, end: today, limit: 8 }, !!acct && !!today)
  // Only this account's own rows: a list still showing the last account's while the new one loads would mislead.
  const rows = (recent.data?.items ?? []).filter((x) => x.from_id === acct?.id || x.to_id === acct?.id)

  // The draft store is shared with the composer: start clean, before the first paint.
  useLayoutEffect(() => { if (today) reset(blank(today)) }, [!!today]) // eslint-disable-line react-hooks/exhaustive-deps
  // Closing after adding some: one line on Home or Activity says how many.
  const tally = useRef({ added: 0, queued: 0 })
  useEffect(() => { tally.current = { added: added.length, queued } }, [added.length, queued])
  useEffect(() => () => {
    const n = tally.current.added + tally.current.queued
    if (n) toast({ text: `Caught up: ${n === 1 ? '1 entry' : `${n} entries`} added${tally.current.queued ? `, ${tally.current.queued} waiting for Tailscale` : ''}` })
  }, [])

  const go = (p: Page, way: 1 | -1) => {
    Haptics.selectionAsync().catch(() => {})
    Keyboard.dismiss()
    setErrors([])
    setDir(way)
    setPage(p)
  }
  const refuse = () => { shake(); play('error', 0.6); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}) }
  const count = acct ? added.filter((x) => x.from_id === acct.id || x.to_id === acct.id).length : 0
  const cents = toCents(d.amount)
  const lookalike = acct && cents && page === 'amount'
    ? lookalikes(history.data?.items ?? [], { date: d.date, amount: cents * (d.refund ? -1 : 1) }, acct.id).find((x) => !added.some((y) => y.id === x.id)) ?? null
    : null

  // A new line keeps the day of the last one: a bank's list goes day by day.
  const start = () => { reset({ ...blank(d.date || today), date: d.date || today! }); setLast(null); go('what', 1) }
  const pickPast = (x: Txn) => {
    const kind = t.catOf(x).type
    set({ what: x.what, category_id: x.category_id, kind, refund: false, ...sides(kind, acct!.id, x) })
    go('amount', 1)
  }
  const pickCategory = (id: number, back: boolean) => {
    const cat = t.cat.get(id)
    if (!cat) return
    set({ category_id: id, kind: cat.type, refund: cat.type === 'Spending' && d.refund, ...sides(cat.type, acct!.id, d) })
    setErrors([])
    if (back) go('amount', -1)
  }
  const pickOther = (id: number | null) => {
    set(otherSide(d, acct!.id).side === 'from' ? { from_id: id } : { to_id: id })
    go('amount', -1)
  }

  async function add() {
    if (!acct || saving) return
    const lines = toInputs(d)
    const errs: string[] = []
    if (!cents) errs.push('Enter an amount.')
    if (!d.category_id) errs.push('Pick a category.')
    else if (!fits(lines[0], d.kind)) errs.push(HINT[d.kind])
    if (errs.length) { setErrors(errs); refuse(); return }
    setSaving(true)
    const label = d.what || t.cat.get(d.category_id!)?.name || 'Entry'
    try {
      const saved = await sendOrQueue(lines, label)
      if (saved) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        play(d.kind === 'Money in' ? 'income' : 'add')
        markFresh(saved.map((x) => x.id))
        setAdded((a) => [...a, ...saved])
        setLast({ row: saved[0], label, cents })
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
        play('tick')
        setQueued((n) => n + 1)
        setLast({ row: null, label, cents })
      }
      invalidateAll().catch(() => {})
      setDone(true) // the button draws its check, then the next entry slides in
      await new Promise((r) => setTimeout(r, 420))
      setDone(false)
      reset({ ...blank(d.date), date: d.date })
      go('what', 1)
    } catch (e) {
      setErrors(e instanceof ApiError ? e.errors : ['Tally is unreachable. Check Tailscale and try again.'])
      refuse()
    } finally {
      setSaving(false)
    }
  }
  async function undo() {
    const row = last?.row
    if (!row) return
    try {
      await api.deleteTxn(row.id)
      play('remove')
      Haptics.selectionAsync().catch(() => {})
      setAdded((a) => a.filter((x) => x.id !== row.id))
      setLast(null)
      invalidateAll().catch(() => {})
    } catch (e) {
      setLast({ ...last!, error: e instanceof ApiError ? e.errors.join(' ') : "Couldn't undo: Tally is unreachable." })
    }
  }

  const back = () => go(page === 'what' ? 'list' : page === 'amount' ? 'what' : 'amount', -1)

  // The bar rides the keyboard while a name is being typed, as in the composer.
  const reduce = useReducedMotion()
  const kb = useSharedValue(0)
  useEffect(() => {
    const to = (h: number, ms?: number) => kb.set(reduce ? h : withTiming(h, { duration: ms || 250, easing: KEYBOARD }))
    const show = Keyboard.addListener('keyboardWillShow', (e) => to(e.endCoordinates.height, e.duration))
    const hide = Keyboard.addListener('keyboardWillHide', (e) => to(0, e.duration))
    return () => { show.remove(); hide.remove() }
  }, [reduce]) // eslint-disable-line react-hooks/exhaustive-deps
  const bottom = insets.bottom
  const barStyle = useAnimatedStyle(() => ({ paddingBottom: Math.max(kb.get(), bottom) + space.s }))

  if (!t.b || !acct) return <View style={{ flex: 1, backgroundColor: c.bg }} />
  const historyRows = history.data?.items ?? []

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1 }}>
        <Pages page={page} dir={dir} render={(p) => (
          p === 'list' ? <LeftOff accounts={list} acct={acct} onAcct={(id) => { setPicked(id); setLast(null) }} rows={rows} loading={recent.isLoading} added={count} />
          : p === 'what' ? <What acct={acct} history={historyRows} count={count} last={last} onUndo={undo} onPick={pickPast} onSubmit={() => go('amount', 1)} />
          : p === 'amount' ? <Amount acct={acct} history={historyRows} count={count} lookalike={lookalike} errors={errors} shake={shakeStyle}
              onWhat={() => go('what', -1)} onCategory={(id) => pickCategory(id, false)} onMoreCategories={() => go('category', 1)}
              onOther={() => go('other', 1)} onFlip={() => { Haptics.selectionAsync().catch(() => {}); set(flip(d)) }} onRefuse={refuse} />
          : p === 'category' ? <Categories onPick={(id) => pickCategory(id, true)} />
          : <Other acct={acct} onPick={pickOther} />
        )} />
      </View>
      <Animated.View style={[{ flexDirection: 'row', gap: space.s, paddingHorizontal: space.l, paddingTop: space.s }, barStyle]}>
        {page !== 'list' && <Button label={page === 'what' && (count || last) ? 'Done' : 'Back'} secondary onPress={back} style={{ flex: 1, height: 52 }} />}
        {page === 'list' ? <Button label={`Add to ${acct.name}`} onPress={start} style={{ flex: 1, height: 52 }} />
          : page === 'what' ? <Button label="Next" onPress={() => go('amount', 1)} style={{ flex: 2, height: 52 }} />
          : page !== 'amount' ? <View style={{ flex: 2 }} />
          : done ? (
            <Animated.View entering={ZoomIn.duration(180)} accessibilityLiveRegion="polite"
              style={{ flex: 2, height: 52, borderRadius: radius.pill, backgroundColor: c.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s }}>
              <CheckDraw size={24} color={c.onInk} />
              <Txt variant="headline" tone="onInk">Added</Txt>
            </Animated.View>
          ) : <Button label={saving ? 'Adding…' : `Add ${formatCents(cents)}`} onPress={add} disabled={saving} style={{ flex: 2, height: 52 }} />}
      </Animated.View>
    </View>
  )
}
