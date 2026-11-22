// Adding an entry, one question at a time: amount and type, what it was, category, accounts, then a review with the
// date and Add. Tapping an answer moves on by itself, and Back and Next are always there. Picking a past entry or a
// quick action fills in what it knows and starts past those steps; Next goes one page at a time, or to the review
// once nothing after it is left to answer. A page opened from the review says Done and goes back there. Editing an
// entry uses the form (entry.tsx). The pages themselves are in components/ComposerSteps.
// A new entry starts empty: no category or account is guessed for you.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { CheckDraw } from '@/components/CheckDraw'
import { QuickChips, Review } from '@/components/ComposerReview'
import { Accounts, Categories, DatePill, Dot, OpKey, What } from '@/components/ComposerSteps'
import { Keypad, typeOver } from '@/components/Keypad'
import { EASE } from '@/components/ease'
import { Pages } from '@/components/Pages'
import { Segmented } from '@/components/native/Segmented'
import { RollingText } from '@/components/Rolling'
import { useShake } from '@/components/Shake'
import { Button } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { openEntry } from '@/lib/actions'
import { api, ApiError, type CatType, type Txn } from '@/lib/api'
import { addedText, addLabel, chipIn, chipOut, KIND_NAME, quickFill, signed, toKind, withKind } from '@/lib/compose'
import { close, useBusy, useCloseHere } from '@/lib/nav'
import { useDraftOwner } from '@/lib/draftOwner'
import { invalidateAll, useTransactions } from '@/lib/data'
import { blank, fromCents, pressOver, toCents, toInputs, useDraft, type Draft } from '@/lib/draft'
import { formatCents } from '@/lib/money'
import { markFresh, useQuickFloat } from '@/lib/motion'
import { QUEUED, sendOrQueue } from '@/lib/outbox'
import { Reveal } from '@/lib/privacy'
import { play } from '@/lib/sound'
import { expression, operate, total, type Calc } from '@/lib/calc'
import { fromLink } from '@/lib/capture'
import { fits, HINT } from '@/lib/shapes'
import type { Tone } from '@/lib/txn'
import { answeredBy, needed, nextStep, stepAfter, stepsFor, type Step } from '@/lib/steps'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { radius, space, useTheme } from '@/theme'
import { CatchUp } from './catchup'
import { Entry } from './entry'

const KINDS = (Object.keys(KIND_NAME) as CatType[]).map((k): [CatType, string] => [k, KIND_NAME[k]])
const KEYBOARD = Easing.bezier(0.38, 0.7, 0.125, 1) // close to the iOS keyboard's own curve

/** A second link (another tap to pay) while the composer is open reuses this screen with new params: keyed on them,
 *  it starts over with the new amount instead of keeping the first. */
export default function New() {
  const link = useLocalSearchParams()
  return <Composer key={JSON.stringify(link)} />
}

function Composer() {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const t = useTally()
  // fav: a quick action from Home. from: opened from an account's page. date: "Add another" keeps the last date.
  // amount, what, card, category: a quick-capture link (lib/capture.ts), e.g. from an iOS Shortcuts automation.
  const link = useLocalSearchParams<{ fav?: string; from?: string; date?: string; amount?: string; what?: string; card?: string; account?: string; category?: string }>()
  const { fav, from, date } = link
  const { d, set, reset } = useDraft()
  const owner = useDraftOwner()
  const busy = useBusy()
  const closeHere = useCloseHere()
  const history = useTransactions({ limit: 600 }, !!t.b)
  // "Recent" suggests what has happened, not the bills scheduled weeks ahead that topped it.
  const past = useMemo(() => (history.data?.items ?? []).filter((x) => !t.b || x.date <= t.b.today), [history.data, t.b])
  // Seed the draft once: blank, from an account, or from a quick action (which may already have an amount, and then
  // it starts on the first step still missing something).
  const makeSeed = () => {
    if (!t.b) return null
    const base = { ...blank(date ?? t.today), from_id: from && t.acct.has(Number(from)) ? Number(from) : null }
    const f = fav ? t.b.favorites.find((x) => x.id === Number(fav)) : undefined
    if (f) return { ...base, ...quickFill(f, t.cat.get(f.category_id), false) }
    return link.amount || link.what ? { ...base, ...fromLink(link, t.b, history.data?.items ?? []) } : base
  }
  const [seed] = useState(makeSeed)
  // Steps shown, or answered by a quick action (its category and accounts), which Next may pass.
  const seenFor = (s: Draft | null) => new Set<Step>(['amount', ...(fav && s?.category_id ? answeredBy(s.kind) : [])])
  const [seen, setSeen] = useState(() => seenFor(seed))
  const [step, setStep] = useState<Step>(() => (seed?.amount ? nextStep('amount', seed, seenFor(seed)) : 'amount'))
  const [dir, setDir] = useState<1 | -1>(1)
  const [quick, setQuick] = useState<number | null>(fav ? Number(fav) : null) // the quick action filling the draft
  const quickGave = useRef(false) // it brought the amount, so taking it back out clears that too
  // The amount shows as selected when its page opens with one already there: the first digit types over it.
  const [over, setOver] = useState(false)
  // A page opened from the review (its row or dot): the button says Done and goes back, asking only what's missing.
  const [toReview, setToReview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [shakeStyle, shake] = useShake()
  const loaded = useRef(false)

  // Before the first paint, so the last entry's draft never flashes up in the new one.
  useLayoutEffect(() => {
    if (loaded.current || !t.b) return
    loaded.current = true
    // Opened before anything had loaded (no cache yet): seed now, so a quick action or account isn't lost.
    const s = seed ?? makeSeed()!
    reset(s, owner)
    quickGave.current = !!fav && !!s.amount
    if (!seed) setSeen(seenFor(s)) // eslint-disable-line react-hooks/set-state-in-effect
    if (!seed && s.amount) setStep(nextStep('amount', s, seenFor(s)))
  }, [t.b]) // eslint-disable-line react-hooks/exhaustive-deps

  // A link's place seen before the history loaded: fill in its category and accounts once it does.
  const linked = useRef(false)
  useEffect(() => {
    if (linked.current || !link.what || !history.data || !t.b || useDraft.getState().d.category_id) return
    linked.current = true
    const more = fromLink(link, t.b, history.data.items)
    if (more.category_id) set({ category_id: more.category_id, from_id: more.from_id ?? null, to_id: more.to_id ?? null, kind: more.kind ?? 'Spending' })
    if (more.category_id && step === 'category') go(nextStep('category', useDraft.getState().d, seen)) // eslint-disable-line react-hooks/immutability
  }, [history.data, t.b]) // eslint-disable-line react-hooks/exhaustive-deps

  const steps = stepsFor(d.kind)
  const at = steps.indexOf(step)
  const cents = toCents(d.amount)
  const cat = d.category_id ? t.cat.get(d.category_id) : undefined
  const figure = signed(cents, d.kind, d.refund)

  const go = (s: Step, viaBack = false) => {
    if (s === step) return
    if (step === 'amount' && !settleRef.current()) return // a sum in progress becomes the amount
    Haptics.selectionAsync().catch(() => {})
    Keyboard.dismiss() // a focused field slides away with its page; the keyboard goes with it
    setDir(stepsFor(d.kind).indexOf(s) >= at ? 1 : -1)
    setSeen((x) => new Set(x).add(s))
    setErrors([])
    if (step === 'review' && !viaBack) setToReview(true)
    if (s === 'review') setToReview(false)
    setOver(s === 'amount' && !!useDraft.getState().d.amount)
    setStep(s)
  }
  // Next from a step, given the draft as it is after that step's answer (a pick updates the store and moves on at once).
  // + and − on the amount page add things up; Next (or =) takes the total.
  const [calc, setCalc] = useState<Calc | null>(null)
  const shown = calc ? formatCents(total(calc, d.amount)) : figure.text
  const sel = typeOver(c, over, shown)
  const tone = (x: Tone) => (x === 'pos' ? c.pos : x === 'neg' ? c.neg : c.label)
  function settle() {
    if (!calc) return true
    const sum = total(calc, d.amount)
    // A sum below zero is a refund ("− 12" on spending); only spending has refunds.
    if (!sum || (sum < 0 && d.kind !== 'Spending')) { refuse(); return false }
    set({ amount: fromCents(sum), refund: sum < 0 })
    setCalc(null)
    return true
  }
  const settleRef = useRef(settle)
  settleRef.current = settle // eslint-disable-line react-hooks/refs
  const op = (sign: 1 | -1) => {
    Haptics.selectionAsync().catch(() => {}); play('tick', 0.6)
    setOver(false)
    // − before anything is typed on spending marks a refund rather than starting a sum ("− 62.26" with an = key).
    if (sign < 0 && !calc && !d.amount && d.kind === 'Spending') { set({ refund: !d.refund }); return }
    setCalc(operate(calc, d.amount, sign, d.refund ? -1 : 1)) // a refund already typed starts the sum below zero
    quickGave.current = false // the sum is yours now, whatever started it
    set({ amount: '' })
  }
  const next = () => {
    if (step === 'amount' && !settle()) return
    const now = useDraft.getState().d
    if (step === 'amount' && !toCents(now.amount)) { refuse(); return }
    if (needed(step, now)) { refuse(); return } // a second tap on Next can't fly past an unpicked category
    go(toReview ? nextStep(step, now, seen) : stepAfter(step, now, seen))
  }
  // Back from a page opened from the review goes back to the review, where it came from.
  const back = () => (toReview ? go('review', true) : at > 0 ? go(steps[at - 1], true) : close())
  const refuse = () => { shake(); play('error', 0.6); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}) }
  const onKey = (k: string) => {
    const n = pressOver(d.amount, k, over)
    if (over) setOver(false)
    else if (n === d.amount && d.amount && k !== 'del') { refuse(); return }
    quickGave.current = false // typed over a chip's amount: it's yours, and stays if the chip is taken back out
    set({ amount: n })
  }
  const clear = () => { setOver(false); quickGave.current = false; set({ amount: '' }) }

  // The account it was opened from (an account's page, or Activity filtered to it) stays through kind changes.
  const home = from && t.acct.has(Number(from)) ? Number(from) : null
  const setKind = (kind: CatType) => set(toKind(d, kind, cat?.type, home))
  // A quick action fills the draft, keeping an amount you typed (not one the chip before it brought), and moves on
  // once there's an amount: to the review, or to "What was it?" when its label only names the category. Tapping it
  // again takes it back out, keeping the kind, an amount you typed and the account it was opened from.
  const pickQuick = (id: number) => {
    Haptics.selectionAsync().catch(() => {})
    if (quick === id) {
      setQuick(null)
      set(chipOut(d, quickGave.current, home))
      quickGave.current = false
      setSeen(new Set(['amount']))
      return
    }
    const f = t.b!.favorites.find((x) => x.id === id)!
    const { patch, gave } = chipIn(d, f, t.cat.get(f.category_id), { gave: quickGave.current, summing: !!calc })
    setQuick(id)
    set(patch)
    quickGave.current = gave
    const now = useDraft.getState().d
    const answered = new Set([...seen, ...answeredBy(now.kind)])
    setSeen(answered)
    if (now.amount || calc) go(nextStep('amount', now, answered))
  }
  // The chips that fit: all of them on Spending (one for another kind switches to it), only that kind's elsewhere.
  const chips = (t.b?.favorites ?? []).filter((f) => d.kind === 'Spending' || f.id === quick || t.cat.get(f.category_id)?.type === d.kind)
  const pickPast = (x: Txn) => {
    set(withKind(d, { what: x.what, category_id: x.category_id, from_id: x.from_id, to_id: x.to_id, kind: t.catOf(x).type }))
    const now = useDraft.getState().d
    const answered = new Set([...seen, ...answeredBy(now.kind)])
    setSeen(answered)
    go(nextStep('what', now, answered))
  }
  // Splitting needs the full form: it slides in as one more page, with the split already started. (Swapping this
  // modal for the editor's dropped the sheet without animating and slid a new one up.)
  const [form, setForm] = useState(false)
  const split = () => {
    Keyboard.dismiss()
    Haptics.selectionAsync().catch(() => {})
    set({ split: [{ key: 'a', category_id: d.category_id, amount: d.amount }, { key: 'b', category_id: null, amount: '' }], target: 'b' })
    setForm(true)
  }

  // Several entries for one account at once (the end-of-week catch-up) slide in as one more page, like the split form.
  const [catching, setCatching] = useState(false)
  const catchUp = () => { Keyboard.dismiss(); Haptics.selectionAsync().catch(() => {}); setCatching(true) }

  const save = () => busy(saveNow) // a second tap while the first is saving does nothing
  async function saveNow() {
    if (!t.b) return
    const lines = toInputs(d)
    const errs: string[] = []
    if (!cents) errs.push('Enter an amount.')
    if (!d.category_id) errs.push('Pick a category.')
    if (!fits(lines[0], d.kind)) errs.push(HINT[d.kind])
    setErrors(errs)
    if (errs.length) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); return }
    setSaving(true)
    // Add another keeps the day and the account it was opened from (an account's page, or Activity filtered to one).
    const again = { label: 'Add another', run: () => { router.push({ pathname: '/new', params: { date: d.date, ...(from ? { from } : {}) } }) } }
    try {
      const saved = await sendOrQueue(lines, d.what || (cat?.name ?? 'Entry'))
      if (!saved) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
        play('tick')
        close()
        toast({ text: QUEUED, action: again })
        return
      }
      // A failed upload is said in the last toast: one of its own was replaced by "Added…" before it could be read.
      const lost = d.photo && saved[0] ? await api.uploadReceipt(saved[0].id, d.photo).then(() => false, () => true) : false
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      play(d.kind === 'Money in' && !d.refund ? 'income' : 'add')
      markFresh(saved.map((x) => x.id))
      if (quick != null) useQuickFloat.getState().show(quick, cents)
      invalidateAll().catch(() => {}) // refreshes behind the check: waiting on it made Add feel slow
      setDone(true) // the button draws a check before the sheet goes
      await new Promise((r) => setTimeout(r, 560))
      closeHere()
      // Catching up on a week at once: Add another starts the next entry on the same day. Tapping the message opens
      // the entry just added, to fix a typo straight away.
      const open = saved[0] ? () => openEntry(saved[0].id) : undefined
      const text = addedText({ cents, kind: d.kind, refund: d.refund, what: d.what, category: cat?.name,
        account: d.to_id ? t.acct.get(d.to_id)?.name : undefined, date: d.date, today: t.today })
      toast(lost ? { text: `${text}, but the receipt photo didn't upload. Add it from the entry.`, tone: 'error', action: again, onPress: open }
        : { text, action: again, onPress: open })
    } catch (e) {
      setErrors(e instanceof ApiError ? e.errors : ['Tally is unreachable. Check Tailscale and try again.'])
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      play('error')
    } finally {
      setSaving(false)
    }
  }

  // Back grows in beside Next once there's somewhere to go back to, instead of popping in and squeezing it. It grows
  // from no width at all: `flex: 0` would size it to its label, and Next came up short on the first step.
  const reduce = useReducedMotion()
  const canBack = at > 0 || toReview
  const backK = useSharedValue(canBack ? 1 : 0)
  useEffect(() => { backK.set(reduce ? (canBack ? 1 : 0) : withTiming(canBack ? 1 : 0, { duration: 320, easing: EASE })) }, [canBack]) // eslint-disable-line react-hooks/exhaustive-deps
  const backStyle = useAnimatedStyle(() => ({ flexGrow: backK.get(), marginRight: -space.s * (1 - backK.get()), opacity: backK.get() }))

  // The Back / Next bar rides on top of the keyboard while "What was it?" is being typed, moving with it on the
  // keyboard's own timing (it used to jump to the end position as the keyboard started to move).
  const kb = useSharedValue(0)
  useEffect(() => {
    const to = (h: number, ms?: number) => kb.set(reduce ? h : withTiming(h, { duration: ms || 250, easing: KEYBOARD }))
    const show = Keyboard.addListener('keyboardWillShow', (e) => to(e.endCoordinates.height, e.duration))
    const hide = Keyboard.addListener('keyboardWillHide', (e) => to(0, e.duration))
    return () => { show.remove(); hide.remove() }
  }, [reduce]) // eslint-disable-line react-hooks/exhaustive-deps
  const bottom = insets.bottom
  const barStyle = useAnimatedStyle(() => ({ paddingBottom: Math.max(kb.get(), bottom) + space.s }))

  // Each step's question sits at the top of its page and moves with it; the header stays put.
  const heading: Partial<Record<Step, string>> = { category: 'Category', from: d.kind === 'Spending' ? 'Paid from' : 'From', to: d.kind === 'Money in' ? 'Landed in' : 'To' }
  const minus = calc?.sign === -1 || (!calc && !d.amount && d.refund)

  // The steps; splitting slides the full form in over them as one more page.
  const flow = (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Where you are: one dot per step. A dot you've been to jumps back there. */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: space.s }}>
        {steps.map((s, i) => (
          <Dot key={s} on={s === step} done={i <= at} label={`Step ${i + 1} of ${steps.length}`} onPress={() => { if (seen.has(s)) go(s) }} />
        ))}
      </View>

      <View style={{ flex: 1 }}>
        <Pages page={step} dir={dir} render={(s) => (
          <>
            {s === 'amount' && (
              <View style={{ flex: 1, paddingHorizontal: space.l, gap: space.l }}>
                <Segmented options={KINDS} value={d.kind} onChange={setKind} />
                <QuickChips list={chips} quick={quick} onPick={pickQuick} />
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xs }}>
                  <View style={{ alignItems: 'center' }}>
                    {/* Just above the figure, taking no room: tapping it away doesn't move the figure. */}
                    <View style={{ position: 'absolute', bottom: '100%', paddingBottom: space.xs }}><DatePill /></View>
                    {/* An amount already there when the page opens shows as selected: the first digit replaces it. */}
                    <Animated.View style={[shakeStyle, { borderRadius: radius.input, borderCurve: 'continuous', paddingHorizontal: space.s, backgroundColor: sel.fill }]}
                      accessible accessibilityRole="text" accessibilityLabel={sel.label ?? shown}>
                      <RollingText text={shown}
                        style={{ fontSize: 64, fontWeight: '700', letterSpacing: -1.5, color: !d.amount && !calc ? c.label3 : calc ? c.label : tone(figure.tone) }} />
                    </Animated.View>
                  </View>
                  {/* Always there (a blank line when there's nothing to say), so the figure doesn't jump when a sum starts. */}
                  <Txt variant="callout" tone={!calc && d.refund && d.kind === 'Spending' ? 'pos' : 'label2'} num={!!calc} numberOfLines={1}>
                    {calc ? expression(calc, d.amount) : d.refund && d.kind === 'Spending' ? 'Refund' : d.what || ' '}
                  </Txt>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.s, marginBottom: -space.s }}>
                  {calc && <OpKey label="=" hint="Total" onPress={() => { Haptics.selectionAsync().catch(() => {}); settle() }} />}
                  <OpKey label="−" on={minus} onPress={() => op(-1)}
                    hint={calc || d.amount || d.kind !== 'Spending' ? 'Subtract the next amount' : d.refund ? 'Refund. Tap to make it spending again' : 'A refund: type the amount back'} />
                  <OpKey label="+" hint="Add another amount" onPress={() => op(1)} on={calc?.sign === 1} />
                </View>
                <Keypad onKey={onKey} onClear={clear} />
              </View>
            )}

            {s === 'what' && <What history={past} fixing={toReview} onPick={pickPast} onSubmit={next} />}

            {s === 'category' && <Categories heading={heading.category!} onPick={(id) => { set({ category_id: id }); next() }} onKind={setKind} />}

            {(s === 'from' || s === 'to') && <Accounts side={s} heading={heading[s]!} onPick={next} />}

            {s === 'review' && <Review onGo={go} onSplit={split} errors={errors} />}
          </>
        )} />
      </View>

      <Animated.View style={[{ flexDirection: 'row', gap: space.s, paddingHorizontal: space.l, paddingTop: space.s }, barStyle]}>
        <Animated.View style={[{ overflow: 'hidden', flexBasis: 0 }, backStyle]} pointerEvents={canBack ? 'auto' : 'none'}
          accessibilityElementsHidden={!canBack} importantForAccessibility={canBack ? 'auto' : 'no-hide-descendants'}>
          <Button label="Back" secondary onPress={back} style={{ height: 52 }} />
        </Animated.View>
        {step !== 'review' ? (
          <Button label={toReview ? 'Done' : 'Next'} onPress={next} style={{ flex: 2, height: 52 }} />
        ) : done ? (
          <Animated.View entering={ZoomIn.duration(180)} accessibilityLiveRegion="polite"
            style={{ flex: 2, height: 52, borderRadius: radius.pill, backgroundColor: c.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s }}>
            <CheckDraw size={24} color={c.onInk} />
            <Txt variant="headline" tone="onInk">Added</Txt>
          </Animated.View>
        ) : (
          <Button label={saving ? 'Adding…' : addLabel(cents, d.kind, d.refund)} onPress={save} disabled={saving} style={{ flex: 2, height: 52 }} />
        )}
      </Animated.View>
    </View>
  )

  // Kept from one render to the next (this screen renders on every key): a new one rebuilds the header's buttons, and a
  // tap in between was lost.
  const offerCatchUp = !form && !catching && step === 'amount'
  const header = useMemo(() => (
    <>
      <Stack.Screen options={{ title: catching ? 'Catch up' : 'New entry' }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Cancel" onPress={() => { Keyboard.dismiss(); close() }} />
      </Stack.Toolbar>
      {offerCatchUp && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon="text.badge.plus" accessibilityLabel="Catch up an account" onPress={catchUp} />
        </Stack.Toolbar>
      )}
    </>
  ), [catching, offerCatchUp])

  return (
    <Reveal.Provider value>
      {header}
      <View style={{ flex: 1 }}>
        <Pages page={form ? 'form' : catching ? 'catchup' : 'steps'} dir={1}
          render={(k) => (k === 'form' ? <Entry embedded /> : k === 'catchup' ? <CatchUp account={from ? Number(from) : undefined} /> : flow)} />
      </View>
    </Reveal.Provider>
  )
}
