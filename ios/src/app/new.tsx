// Adding an entry, one question at a time: amount and type, what it was, category, accounts, then a review with the
// date and Add. Tapping an answer moves on by itself, and Back and Next are always there. Picking a past entry or a
// quick action fills in what it knows, and Next skips those steps. Editing an entry uses the form (entry.tsx).
// A new entry starts empty: no category or account is guessed for you.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, ScrollView, Switch, TextInput, View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming, ZoomIn } from 'react-native-reanimated'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { CheckDraw } from '@/components/CheckDraw'
import { Chip } from '@/components/Chip'
import { Icon } from '@/components/Icon'
import { Keypad } from '@/components/Keypad'
import { Mark } from '@/components/Mark'
import { Money } from '@/components/Money'
import { DatePick } from '@/components/native/DatePick'
import { Segmented } from '@/components/native/Segmented'
import { Receipt } from '@/components/Receipt'
import { RollingText } from '@/components/Rolling'
import { useShake } from '@/components/Shake'
import { Group, Row } from '@/components/Row'
import { Button, Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { categoryVisual, KIND_LABEL, KIND_SYMBOL } from '@/icons/categories'
import { merchantKey } from '@/icons/merchants'
import { api, ApiError, type CatType, type Kind, type Txn } from '@/lib/api'
import { close } from '@/lib/nav'
import { invalidateAll, useTransactions } from '@/lib/data'
import { addDays, dayLabel, fromISO } from '@/lib/dates'
import { blank, fromCents, press, toCents, toInputs, useDraft } from '@/lib/draft'
import { formatCents } from '@/lib/money'
import { markFresh, useQuickFloat } from '@/lib/motion'
import { monthsNow } from '@/lib/months'
import { QUEUED, sendOrQueue } from '@/lib/outbox'
import { fits, HINT, SHAPES } from '@/lib/shapes'
import { nextStep, stepsFor, type Step } from '@/lib/steps'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { radius, space, useTheme } from '@/theme'

const KINDS: [CatType, string][] = [['Spending', 'Spent'], ['Money in', 'Income'], ['Transfer', 'Transfer'], ['Saving', 'Saving'], ['Loan', 'Loan']]
const KIND_ORDER: Kind[] = ['cash', 'card', 'investment', 'loan']

export default function New() {
  const { c, tint } = useTheme()
  const insets = useSafeAreaInsets()
  const t = useTally()
  // fav: a quick action from Home. from: opened from an account's page. date: "Add another" keeps the last date.
  const { fav, from, date } = useLocalSearchParams<{ fav?: string; from?: string; date?: string }>()
  const { d, set, reset } = useDraft()
  const history = useTransactions({ limit: 600 }, !!t.b)
  // Seed the draft once: blank, from an account, or from a quick action (which may already have an amount, and then
  // it starts on the first step still missing something).
  const [seed] = useState(() => {
    if (!t.b) return null
    const base = { ...blank(date ?? t.b.today), from_id: from && t.acct.has(Number(from)) ? Number(from) : null }
    const f = fav ? t.b.favorites.find((x) => x.id === Number(fav)) : undefined
    return f ? { ...base, ...fill(f.id) } : base
  })
  const [step, setStep] = useState<Step>(() => (seed?.amount ? nextStep('amount', seed, new Set()) : 'amount'))
  const [dir, setDir] = useState(1)
  const [seen, setSeen] = useState<Set<Step>>(new Set(['amount']))
  const [quick, setQuick] = useState<number | null>(fav ? Number(fav) : null) // the quick action filling the draft
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [shakeStyle, shake] = useShake()
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current || !t.b) return
    loaded.current = true
    reset(seed ?? blank(date ?? t.b.today))
  }, [t.b]) // eslint-disable-line react-hooks/exhaustive-deps

  const steps = stepsFor(d.kind)
  const at = steps.indexOf(step)
  const cents = toCents(d.amount)
  const cat = d.category_id ? t.cat.get(d.category_id) : undefined
  const shape = SHAPES[d.kind]

  function fill(id: number) {
    const f = t.b!.favorites.find((x) => x.id === id)!
    return { what: f.label, category_id: f.category_id, from_id: f.from_account_id, to_id: f.to_account_id,
      kind: t.cat.get(f.category_id)?.type ?? 'Spending', ...(f.amount ? { amount: fromCents(f.amount) } : {}) }
  }
  const go = (s: Step) => {
    Haptics.selectionAsync().catch(() => {})
    setDir(stepsFor(d.kind).indexOf(s) >= at ? 1 : -1)
    setSeen((x) => new Set(x).add(s))
    setErrors([])
    setStep(s)
  }
  // Next from a step, given the draft as it is after that step's answer (a pick updates the store and moves on at once).
  const next = () => {
    if (step === 'amount' && !cents) { refuse(); return }
    go(nextStep(step, useDraft.getState().d, seen))
  }
  const back = () => (at > 0 ? go(steps[at - 1]) : close())
  const refuse = () => { shake(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}) }

  // Changing the kind drops a category and accounts that no longer fit it. Nothing is picked for you.
  const setKind = (kind: CatType) => {
    const s = SHAPES[kind]
    set({ kind, category_id: cat?.type === kind ? d.category_id : null, refund: kind === 'Spending' ? d.refund : false,
      from_id: s.from === 'blank' ? null : d.from_id, to_id: s.to === 'blank' ? null : d.to_id })
  }
  // A quick action fills the draft (and moves on if it has an amount too); tapping it again takes it back out.
  const pickQuick = (id: number) => {
    Haptics.selectionAsync().catch(() => {})
    if (quick === id) {
      const f = t.b!.favorites.find((x) => x.id === id)
      setQuick(null)
      set({ ...blank(d.date), date: d.date, amount: f?.amount ? '' : d.amount })
      return
    }
    setQuick(id)
    const p = fill(id)
    set(p)
    if (p.amount) go(nextStep('amount', { ...useDraft.getState().d }, seen))
  }
  const pickPast = (x: Txn) => {
    set({ what: x.what, category_id: x.category_id, from_id: x.from_id, to_id: x.to_id, kind: t.catOf(x).type })
    go(nextStep('what', useDraft.getState().d, seen))
  }
  // Splitting needs the full form: hand it the draft with the split already started.
  const split = () => {
    set({ split: [{ key: 'a', category_id: d.category_id, amount: d.amount }, { key: 'b', category_id: null, amount: '' }], target: 'b' })
    router.replace({ pathname: '/entry', params: { keep: '1' } })
  }

  async function save() {
    if (!t.b || saving) return
    const lines = toInputs(d)
    const errs: string[] = []
    if (!cents) errs.push('Enter an amount.')
    if (!d.category_id) errs.push('Pick a category.')
    if (!fits(lines[0], d.kind)) errs.push(HINT[d.kind])
    setErrors(errs)
    if (errs.length) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); return }
    setSaving(true)
    const again = { label: 'Add another', run: () => { router.push({ pathname: '/new', params: { date: d.date } }) } }
    try {
      const saved = await sendOrQueue(lines, d.what || (cat?.name ?? 'Entry'))
      if (!saved) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
        close()
        toast({ text: QUEUED, action: again })
        return
      }
      if (d.photo && saved[0]) await api.uploadReceipt(saved[0].id, d.photo).catch(() => toast({ text: 'Saved, but the receipt photo did not upload.', tone: 'error' }))
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      markFresh(saved.map((x) => x.id))
      if (quick != null) useQuickFloat.getState().show(quick, cents)
      await invalidateAll()
      setDone(true) // the button draws a check before the sheet goes
      await new Promise((r) => setTimeout(r, 560))
      close()
      // Catching up on a week at once: Add another starts the next entry on the same day.
      toast({ text: `Added ${formatCents(cents)}${cat ? ` to ${cat.name}` : ''}`, action: again })
    } catch (e) {
      setErrors(e instanceof ApiError ? e.errors : ['Tally is unreachable. Check Tailscale and try again.'])
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
    } finally {
      setSaving(false)
    }
  }

  // Each step slides in a little from the side it comes from. Only a slide, never a fade: a layout animation (or a
  // fade) starting while the modal is still presenting can stay stuck and leave the screen blank.
  const reduce = useReducedMotion()
  const slide = useSharedValue(0)
  useEffect(() => {
    if (!reduce) slide.set(withSequence(withTiming(dir * 28, { duration: 0 }), withTiming(0, { duration: 220 })))
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps
  const stepStyle = useAnimatedStyle(() => ({ transform: [{ translateX: slide.get() }] }))

  // The Back / Next bar rides on top of the keyboard while "What was it?" is being typed.
  const [kbH, setKbH] = useState(0)
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) => setKbH(e.endCoordinates.height))
    const hide = Keyboard.addListener('keyboardWillHide', () => setKbH(0))
    return () => { show.remove(); hide.remove() }
  }, [])

  const title = { amount: 'New entry', what: d.kind === 'Money in' ? 'Where from?' : 'What was it?', category: 'Category',
    from: d.kind === 'Spending' ? 'Paid from' : 'From', to: d.kind === 'Money in' ? 'Landed in' : 'To', review: 'Review' }[step]

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Cancel" onPress={() => close()} />
      </Stack.Toolbar>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {/* Where you are: one dot per step. A dot you've been to jumps back there. */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: space.s }}>
          {steps.map((s, i) => (
            <Tap key={s} onPress={() => { if (seen.has(s) && s !== step) go(s) }} hitSlop={6} accessibilityLabel={`Step ${i + 1} of ${steps.length}`}
              style={{ width: s === step ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i <= at ? c.ink : c.fillStrong }}><View /></Tap>
          ))}
        </View>

        <Animated.View style={[{ flex: 1 }, stepStyle]}>
          {step === 'amount' && (
            <View style={{ flex: 1, paddingHorizontal: space.l, gap: space.l }}>
              <Segmented options={KINDS} value={d.kind} onChange={setKind} />
              {t.b && t.b.favorites.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.l, flexGrow: 0 }} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l }}>
                  {t.b.favorites.map((f) => {
                    const fc = t.cat.get(f.category_id)
                    const fv = fc ? categoryVisual({ ...fc, icon: f.icon ?? fc.icon, color: f.color ?? fc.color }) : null
                    return <Chip key={f.id} label={f.label} selected={quick === f.id} onPress={() => pickQuick(f.id)}
                      leading={fv ? <Mark kind="glyph" sf={fv.sf} md={fv.md} tint={tint(fv.tint)} size={28} /> : undefined} />
                  })}
                </ScrollView>
              )}
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xs }}>
                <Animated.View style={shakeStyle}>
                  <RollingText text={formatCents(cents)} style={{ fontSize: 64, fontWeight: '700', letterSpacing: -1.5, color: d.amount ? c.label : c.label3 }} />
                </Animated.View>
                {d.what ? <Txt variant="callout" tone="label2">{d.what}</Txt> : null}
              </View>
              <Keypad onKey={(k) => {
                const n = press(d.amount, k)
                if (n === d.amount && d.amount && k !== 'del') refuse()
                else set({ amount: n })
              }} onClear={() => set({ amount: '' })} />
            </View>
          )}

          {step === 'what' && <What history={history.data?.items ?? []} onPick={pickPast} onSubmit={next} />}

          {step === 'category' && (
            <ScrollView contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.l }}>
              <Group>
                {(t.b?.categories ?? []).filter((x) => x.type === d.kind && (x.active || x.id === d.category_id)).map((x) => {
                  const v = categoryVisual(x)
                  return <Row key={x.id} label={x.name} chevron={false} onPress={() => { set({ category_id: x.id }); next() }}
                    leading={<Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={30} />}
                    trailing={x.id === d.category_id ? <Icon sf="checkmark" md="check" size={16} color={c.ink} weight="bold" /> : undefined} />
                })}
              </Group>
            </ScrollView>
          )}

          {(step === 'from' || step === 'to') && <Accounts side={step} onPick={next} />}

          {step === 'review' && (
            <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.l }}>
              <Tap feedback="opacity" onPress={() => go('amount')} style={{ alignItems: 'center', paddingVertical: space.s }} accessibilityLabel={`Amount ${formatCents(cents)}. Change`}>
                <Txt style={{ fontSize: 44, fontWeight: '700', letterSpacing: -1.2, color: c.label }}>{`${d.refund ? '−' : ''}${formatCents(cents)}`}</Txt>
                <Txt variant="callout" tone="label2">{KINDS.find(([k]) => k === d.kind)?.[1]}</Txt>
              </Tap>
              <Group>
                <Row label={d.kind === 'Money in' ? 'From' : 'What'} value={d.what || 'Add a name'} sf="text.alignleft" md="notes" onPress={() => go('what')} />
                <Row label="Category" value={cat?.name ?? 'Choose'} onPress={() => go('category')}
                  leading={cat ? <CatMark id={cat.id} /> : undefined} sf={cat ? undefined : 'square.grid.2x2'} md={cat ? undefined : 'category'} />
                {shape.from !== 'blank' && <Row label="From" value={d.from_id ? t.acct.get(d.from_id)?.name : 'Choose'} sf="arrow.up.right" md="north_east" onPress={() => go('from')} />}
                {shape.to !== 'blank' && <Row label="To" value={d.to_id ? t.acct.get(d.to_id)?.name : shape.to === 'optional' ? 'None' : 'Choose'} sf="arrow.down.left" md="south_west" onPress={() => go('to')} />}
              </Group>
              <DateStrip />
              <Extras onSplit={split} />
              {errors.length > 0 && (
                <View style={{ padding: space.m, borderRadius: radius.input, backgroundColor: c.panel, gap: 4 }} accessibilityLiveRegion="assertive">
                  {errors.map((e) => <Txt key={e} variant="callout" tone="neg">{e}</Txt>)}
                </View>
              )}
            </ScrollView>
          )}
        </Animated.View>

        <View style={{ flexDirection: 'row', gap: space.s, paddingHorizontal: space.l, paddingTop: space.s, paddingBottom: Math.max(kbH, insets.bottom) + space.s }}>
          {at > 0 && <Button label="Back" secondary onPress={back} style={{ flex: 1, height: 52 }} />}
          {step !== 'review' ? (
            <Button label="Next" onPress={next} style={{ flex: 2, height: 52 }} />
          ) : done ? (
            <Animated.View entering={ZoomIn.duration(180)} accessibilityLiveRegion="polite"
              style={{ flex: 2, height: 52, borderRadius: radius.pill, backgroundColor: c.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s }}>
              <CheckDraw size={24} color={c.onInk} />
              <Txt variant="headline" tone="onInk">Added</Txt>
            </Animated.View>
          ) : (
            <Button label={saving ? 'Adding…' : `Add ${formatCents(cents)}`} onPress={save} disabled={saving} style={{ flex: 2, height: 52 }} />
          )}
        </View>
      </View>
    </>
  )
}

function CatMark({ id }: { id: number }) {
  const t = useTally()
  const { tint } = useTheme()
  const x = t.cat.get(id)
  if (!x) return null
  const v = categoryVisual(x)
  return <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={30} />
}

/** "What was it?": a name, with your past entries of this kind under it. Picking one copies its category and accounts. */
function What({ history, onPick, onSubmit }: { history: Txn[]; onPick: (x: Txn) => void; onSubmit: () => void }) {
  const { c } = useTheme()
  const t = useTally()
  const { d, set } = useDraft()
  const list = useMemo(() => {
    const k = merchantKey(d.what)
    const seen = new Set<string>()
    const out: Txn[] = []
    for (const x of history) {
      const key = merchantKey(x.what)
      if (!key || seen.has(key) || (k && !key.startsWith(k)) || t.catOf(x).type !== d.kind) continue
      seen.add(key)
      out.push(x)
      if (out.length >= 8) break
    }
    return out
  }, [d.what, d.kind, history]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.l }}>
      <TextInput autoFocus value={d.what} onChangeText={(what) => set({ what })} placeholder={d.kind === 'Money in' ? 'Where from?' : 'What was it?'}
        placeholderTextColor={c.label3} returnKeyType="next" onSubmitEditing={onSubmit} submitBehavior="submit" autoCapitalize="words" autoCorrect={false}
        maxFontSizeMultiplier={1.4} style={{ fontSize: 22, fontWeight: '600', color: c.label, paddingVertical: space.s, paddingHorizontal: space.xs }} />
      {list.length > 0 && (
        <Group header={d.what ? 'Matches' : 'Recent'}>
          {list.map((x) => (
            <Row key={x.id} label={x.what} sub={t.catOf(x).name} chevron={false} onPress={() => onPick(x)} leading={<CatMark id={x.category_id} />}
              value={<Money cents={x.amount} tone="neutral" muted variant="callout" />} />
          ))}
        </Group>
      )}
    </ScrollView>
  )
}

function Accounts({ side, onPick }: { side: 'from' | 'to'; onPick: () => void }) {
  const t = useTally()
  const { c, bank } = useTheme()
  const { d, set } = useDraft()
  if (!t.b) return null
  const bal = monthsNow(t.b).cur?.balances ?? {}
  const current = side === 'from' ? d.from_id : d.to_id
  const other = side === 'from' ? d.to_id : d.from_id // money can't move from an account to itself
  const choose = (id: number | null) => { set(side === 'from' ? { from_id: id } : { to_id: id }); onPick() }
  const check = (on: boolean) => (on ? <Icon sf="checkmark" md="check" size={16} color={c.ink} weight="bold" /> : <View style={{ width: 16 }} />)
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.l }}>
      {SHAPES[d.kind][side] === 'optional' && <Group><Row label="None" chevron={false} onPress={() => choose(null)} trailing={check(current == null)} /></Group>}
      {KIND_ORDER.map((k) => {
        const list = t.b!.accounts.filter((a) => a.kind === k && a.id !== other && (a.active || a.id === current))
        if (!list.length) return null
        return (
          <Group key={k} header={KIND_LABEL[k]}>
            {list.map((a) => (
              <Row key={a.id} label={a.name} chevron={false} onPress={() => choose(a.id)} trailing={check(a.id === current)}
                leading={<Mark kind="glyph" sf={KIND_SYMBOL[a.kind][0]} md={KIND_SYMBOL[a.kind][1]} tint={bank(a.bank ?? (a.kind === 'investment' ? 'roth' : 'hsa'))} size={30} />}
                value={<Money cents={bal[String(a.id)] ?? a.start_balance} tone="neutral" muted variant="callout" />} />
            ))}
          </Group>
        )
      })}
    </ScrollView>
  )
}

/** The date: this past week as a row of days, since entries often get caught up at the end of the week, and the
 *  calendar for anything older. */
function DateStrip() {
  const { c } = useTheme()
  const t = useTally()
  const { d, set } = useDraft()
  const [cal, setCal] = useState(false)
  if (!t.b) return null
  const today = t.b.today
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const inWeek = days.includes(d.date)
  return (
    <View style={{ gap: space.s }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space.l }}>
        <Txt variant="sub" tone="label2">{inWeek ? 'Date' : dayLabel(d.date, today)}</Txt>
        <Tap feedback="opacity" onPress={() => { Haptics.selectionAsync().catch(() => {}); setCal(!cal) }} hitSlop={10}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon sf="calendar" md="calendar_today" size={14} color={c.label} />
            <Txt variant="sub" style={{ fontWeight: '600' }}>{cal ? 'Hide calendar' : 'Calendar'}</Txt>
          </View>
        </Tap>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {days.map((iso) => {
          const on = iso === d.date
          const dt = fromISO(iso)
          return (
            <Tap key={iso} onPress={() => { Haptics.selectionAsync().catch(() => {}); set({ date: iso }) }} accessibilityLabel={dayLabel(iso, today)}
              accessibilityState={{ selected: on }}
              style={{ flex: 1, height: 58, borderRadius: 16, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: on ? c.ink : c.panel }}>
              <Txt variant="foot" tone={on ? 'onInk' : 'label2'} numberOfLines={1}>{iso === today ? 'Today' : dt.toLocaleDateString('en-US', { weekday: 'short' })}</Txt>
              <Txt variant="headline" tone={on ? 'onInk' : 'label'} num>{dt.getDate()}</Txt>
            </Tap>
          )
        })}
      </View>
      {cal && (
        <View style={{ backgroundColor: c.panel, borderRadius: radius.panel, borderCurve: 'continuous', padding: space.s }}>
          <DatePick value={d.date} onChange={(date) => set({ date })} />
        </View>
      )}
    </View>
  )
}

/** The rarely needed bits, last: refund, split, note, tags and a receipt. */
function Extras({ onSplit }: { onSplit: () => void }) {
  const { c } = useTheme()
  const { d, set } = useDraft()
  const [tagText, setTagText] = useState<string | null>(null) // raw text while editing tags
  return (
    <Group>
      {d.kind === 'Spending' && (
        <Row label="Refund" sub={d.refund ? 'Counts as money back in this category' : undefined} sf="arrow.uturn.backward" md="undo" chevron={false}
          trailing={<Switch value={d.refund} onValueChange={(refund) => set({ refund })} />} />
      )}
      {d.kind === 'Spending' && <Row label="Split across categories" sf="square.split.2x1" md="call_split" onPress={onSplit} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, minHeight: 50 }}>
        <Icon sf="text.bubble" md="chat" size={18} color={c.label2} />
        <TextInput value={d.note} onChangeText={(note) => set({ note })} placeholder="Note" placeholderTextColor={c.label3} multiline
          style={{ flex: 1, fontSize: 17, color: c.label, paddingVertical: space.m }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, minHeight: 50 }}>
        <Icon sf="number" md="tag" size={18} color={c.label2} />
        <TextInput value={tagText ?? d.tags.join(' ')} placeholder="Tags, separated by spaces" placeholderTextColor={c.label3}
          autoCapitalize="none" autoCorrect={false} onBlur={() => setTagText(null)}
          onChangeText={(v) => { setTagText(v); set({ tags: v.split(/\s+/).map((x) => x.replace(/^#/, '').toLowerCase()).filter(Boolean) }) }}
          style={{ flex: 1, fontSize: 17, color: c.label, paddingVertical: space.m }} />
      </View>
      <Receipt />
    </Group>
  )
}
