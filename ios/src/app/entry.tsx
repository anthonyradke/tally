// The editor: a modal with its own Cancel/Save. Amount on a big keypad, then what, category, accounts and date.
// A new entry starts empty: no category or account is guessed for you.
// New entries go through the outbox, so saving never fails just because the phone is off Tailscale.
// Closing it with changes unsaved (the X, or a swipe down) never asks: a toast says so and Restore reopens it as it was.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, ScrollView, TextInput, View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, ZoomIn } from 'react-native-reanimated'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { Field } from '@/components/Field'
import { CheckDraw } from '@/components/CheckDraw'
import { Chip } from '@/components/Chip'
import { DateStrip } from '@/components/DateStrip'
import { Icon } from '@/components/Icon'
import { Keypad, typeOver } from '@/components/Keypad'
import { Receipt } from '@/components/Receipt'
import { EmptyMark, SplitGroup } from '@/components/SplitGroup'
import { Mark } from '@/components/Mark'
import { Segmented } from '@/components/native/Segmented'
import { RollingText } from '@/components/Rolling'
import { useShake } from '@/components/Shake'
import { Group, Row } from '@/components/Row'
import { TagField } from '@/components/TagField'
import { Button, Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { categoryVisual } from '@/icons/categories'
import { merchantKey } from '@/icons/merchants'
import { api, ApiError, type CatType, type Txn } from '@/lib/api'
import { close, useBusy, useCloseHere, useLatest } from '@/lib/nav'
import { useDraftOwner } from '@/lib/draftOwner'
import { deleteTxns, quickFromEntry, repeatEntry } from '@/lib/actions'
import { cachedTxn, invalidateAll, useTransactions } from '@/lib/data'
import { blank, fromCents, fromTxn, pressOver, toCents, toInputs, useDraft, type Draft } from '@/lib/draft'
import { formatCents } from '@/lib/money'
import { markFresh, useQuickFloat } from '@/lib/motion'
import { QUEUED, sendOrQueue } from '@/lib/outbox'
import { Reveal } from '@/lib/privacy'
import { play } from '@/lib/sound'
import { fits, HINT, SHAPES } from '@/lib/shapes'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { balanceFirst, FREQ_LABEL, putLine } from '@/lib/txn'
import { forgetUnsaved, peekUnsaved, snap, useUnsaved } from '@/lib/unsaved'
import { radius, space, useTheme } from '@/theme'

const KINDS: [CatType, string][] = [['Spending', 'Spent'], ['Money in', 'Income'], ['Transfer', 'Transfer'], ['Saving', 'Saving'], ['Loan', 'Loan']]

export default function EntryRoute() {
  return <Reveal.Provider value><Entry /></Reveal.Provider> // you're typing amounts here: they always show
}

/** The form. `embedded`: shown inside the new-entry steps (to split the draft they hand over), which keep their own
 *  header, so it neither seeds the draft again nor sets the title and buttons. */
export function Entry({ embedded }: { embedded?: boolean }) {
  const { c, tint } = useTheme()
  const insets = useSafeAreaInsets()
  const t = useTally()
  const params = useLocalSearchParams<{ id?: string; mode?: string; fav?: string; from?: string; restore?: string }>()
  const { id, mode, fav, from, restore } = embedded ? {} : params
  const [kept] = useState(() => (restore ? peekUnsaved() : null)) // reopened from "Changes not saved"
  const { d, set, reset } = useDraft()
  const [typing, setTyping] = useState(false)
  const [pad, setPad] = useState(!id)
  // The amount the keypad opened on is selected, like text: the first digit types over it instead of onto its end.
  const [over, setOver] = useState(false)
  const [quick, setQuick] = useState<number | null>(fav ? Number(fav) : null) // the quick action filling the draft
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [shakeStyle, shake] = useShake()
  const [errors, setErrors] = useState<string[]>([])
  const history = useTransactions({ limit: 600 }, !!t.b)
  // The entry being edited or duplicated, fetched by id: it may be older than the newest 600 used for suggestions.
  // The row tapped is nearly always in a list already: start from that copy (refetched right away) so the form is
  // filled on its first frame.
  const one = useQuery({ queryKey: ['transactions', 'one', Number(id)], queryFn: () => api.transaction(Number(id)), enabled: !!id,
    initialData: () => (id ? cachedTxn(Number(id)) : undefined), initialDataUpdatedAt: 0 })
  // "Duplicate to today" from the menu turns this editor into a new entry in place, rather than closing the sheet and
  // opening another one.
  const [dup, setDup] = useState(kept ? kept.dup : mode === 'duplicate')
  const editing = !!id && !dup
  const loaded = useRef(false)
  const owner = useDraftOwner()
  const busy = useBusy()
  const closeHere = useCloseHere()
  // What the form was filled from, to tell whether it's been edited since.
  const seededFrom = useRef<string | null>(null)
  const seededDraft = useRef<string | null>(null)
  const seed = (r: Txn): Draft => {
    const d0 = fromTxn(r, t.catOf(r).type)
    return mode === 'duplicate' ? { ...d0, id: undefined, date: t.today, receipt: null } : d0
  }
  const start = (d0: Draft, from: string | null = null) => {
    reset(d0, owner)
    seededFrom.current = from
    seededDraft.current = snap(useDraft.getState().d)
  }
  const fillFrom = (r: Txn) => start(seed(r), JSON.stringify(r))

  // Seed the draft once: a restored draft, edit, duplicate, a quick action, or a blank entry with sensible defaults.
  // Before the first paint, so the last entry's draft never flashes up in this one.
  useLayoutEffect(() => {
    if (loaded.current || !t.b) return
    if (embedded) { loaded.current = true; return }
    const today = t.today
    if (kept) {
      loaded.current = true
      forgetUnsaved()
      reset(kept.d, owner)
      seededFrom.current = kept.from
      seededDraft.current = kept.seed
      return
    }
    if (id) {
      if (!one.data) { if (useDraft.getState().d.id !== Number(id)) reset(blank(today), owner); return }
      loaded.current = true
      fillFrom(one.data)
      return
    }
    loaded.current = true
    const f = fav ? t.b.favorites.find((x) => x.id === Number(fav)) : undefined
    if (f) {
      const cat = t.cat.get(f.category_id)
      start({ ...blank(today), what: f.label, category_id: f.category_id, from_id: f.from_account_id, to_id: f.to_account_id,
        amount: f.amount ? fromCents(f.amount) : '', kind: cat?.type ?? 'Spending' })
      return
    }
    // Opened from an account's page: the entry starts from that account.
    start({ ...blank(today), from_id: from && t.acct.has(Number(from)) ? Number(from) : null })
  }, [t.b, one.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const leaving = useRef(false) // saved, queued or deleted: closing loses nothing
  const pending = useRef<Promise<boolean> | null>(null) // a save under way: closing offers the draft back if it fails
  const reopen = useLatest({ id, mode: dup ? 'duplicate' : undefined, fav, from })
  useUnsaved(!embedded, owner, () => ({ leaving: leaving.current, pending: pending.current, loaded: loaded.current, seed: seededDraft.current,
    from: seededFrom.current, params: reopen.current }))

  // The form fills on its first frame from a copy already in a list, which can be old (a bulk recategorize changed
  // it since). When the fresh copy arrives and differs, and nothing has been typed yet, the form takes it: saving
  // the old copy used to put the old category and tags back.
  useEffect(() => {
    if (!id || embedded || !loaded.current || !one.data || !one.isFetchedAfterMount) return
    if (JSON.stringify(one.data) === seededFrom.current) return
    const cur = useDraft.getState()
    if (cur.owner !== owner || snap(cur.d) !== seededDraft.current) return // edited already: keep it
    fillFrom(one.data)
  }, [one.data, one.isFetchedAfterMount]) // eslint-disable-line react-hooks/exhaustive-deps

  // Merchant memory: the last entry for each name, and the most used category.
  const memory = useMemo(() => {
    const byKey = new Map<string, Txn>()
    const counts = new Map<number, number>()
    for (const x of history.data?.items ?? []) {
      const k = merchantKey(x.what)
      if (k && !byKey.has(k)) byKey.set(k, x)
      counts.set(x.category_id, (counts.get(x.category_id) ?? 0) + 1)
    }
    return { byKey, counts }
  }, [history.data])

  const cat = d.category_id ? t.cat.get(d.category_id) : undefined
  const shape = SHAPES[d.kind]
  const cents = toCents(d.amount)
  const suggestions = useMemo(() => {
    const k = merchantKey(d.what)
    if (!typing || k.length < 1) return []
    return [...memory.byKey.entries()].filter(([key]) => key.startsWith(k) && key !== k).slice(0, 4).map(([, x]) => x)
  }, [d.what, typing, memory])

  // Changing the kind drops a category and accounts that no longer fit it. Nothing is picked for you.
  const setKind = (kind: CatType) => {
    const keepCat = cat?.type === kind
    const s = SHAPES[kind]
    set({ kind, category_id: keepCat ? d.category_id : null, refund: kind === 'Spending' ? d.refund : false,
      from_id: s.from === 'blank' ? null : d.from_id, to_id: s.to === 'blank' ? null : d.to_id, split: kind === 'Spending' ? d.split : null })
  }
  // Losing focus can make iOS send one last change with the text it still had, overwriting the pick: ignore the field
  // until it's focused again.
  const whatInput = useRef<TextInput>(null)
  const picked = useRef(false)
  const pickSuggestion = (x: Txn) => {
    picked.current = true
    whatInput.current?.blur()
    const ty = t.catOf(x).type
    set({ what: x.what, category_id: x.category_id, from_id: x.from_id, to_id: x.to_id, kind: ty })
    setTyping(false)
  }
  // Puts an amount into the total or a split line. While line 1 hasn't been typed into, it takes what's left.
  const put = (amount: string) => {
    if (!d.split || d.target === 'main') set({ amount, ...(d.split ? { split: balanceFirst(d.split, toCents(amount)) } : {}) })
    else set({ split: putLine(d.split, d.target, amount, cents) })
  }
  // A digit that can't go in (the amount is at its cap) shakes the figure instead of silently doing nothing.
  const onKey = (k: string) => {
    const line = d.target === 'main' ? null : d.split?.find((x) => x.key === d.target)
    const cur = line ? line.amount : d.amount
    const next = pressOver(cur, k, over)
    if (over) setOver(false)
    else if (next === cur && cur && k !== 'del') { refuse(); return }
    put(next)
  }
  const refuse = () => { shake(); play('error', 0.6); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}) }
  const onClear = () => { setOver(false); put('') }

  const splitSum = d.split?.reduce((n, l) => n + toCents(l.amount), 0) ?? 0
  const left = cents - splitSum

  const save = () => busy(saveNow) // a second tap while the first is saving does nothing
  async function saveNow() {
    if (!t.b || (id && !loaded.current)) return // still loading the entry: saving now would write the last draft over it
    const lines = toInputs(d)
    const base = lines[0]
    const errs: string[] = []
    if (!cents) errs.push('Enter an amount.')
    if (!d.split && !d.category_id) errs.push('Pick a category.')
    if (d.split && d.split.some((l) => !l.category_id || !toCents(l.amount))) errs.push('Give every split line a category and an amount.')
    if (d.split && left !== 0) errs.push(`The split is ${formatCents(Math.abs(left))} ${left > 0 ? 'short' : 'over'}.`)
    if (!fits(base, d.kind)) errs.push(HINT[d.kind])
    setErrors(errs)
    if (errs.length) { if (!cents) shake(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); return }
    setSaving(true)
    let settle = (_saved: boolean) => {}
    pending.current = new Promise<boolean>((r) => { settle = r })
    try {
      let saved: Txn[] = []
      if (editing) {
        saved = [await api.updateTxn(Number(id), lines[0])]
        if (d.removeReceipt && d.receipt) await api.deleteReceipt(Number(id))
      } else {
        const r = await sendOrQueue(lines, d.what || (cat?.name ?? 'Entry'))
        if (!r) {
          leaving.current = true
          settle(true) // queued: it'll be sent, nothing to offer back
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
          toast({ text: QUEUED })
          close()
          return
        }
        saved = r
      }
      leaving.current = true
      settle(true)
      // A failed upload is said in the last toast: one of its own was replaced by "Saved" before it could be read.
      const lost = d.photo && saved[0] ? await api.uploadReceipt(saved[0].id, d.photo).then(() => false, () => true) : false
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      play(d.kind === 'Money in' && !d.refund && !editing ? 'income' : 'add')
      markFresh(saved.map((x) => x.id))
      if (fav && !editing) useQuickFloat.getState().show(Number(fav), cents)
      invalidateAll().catch(() => {}) // refreshes behind the check
      setDone(true) // the button draws a check before the sheet goes
      await new Promise((r) => setTimeout(r, 560))
      closeHere()
      toast(lost ? { text: `${editing ? 'Saved' : `Added ${formatCents(cents)}`}, but the receipt photo didn't upload. Try adding it again.`, tone: 'error' }
        : { text: editing ? 'Saved' : `Added ${formatCents(cents)}${cat && !d.split ? ` to ${cat.name}` : ''}` })
    } catch (e) {
      settle(false) // closed meanwhile: the toast offers the draft back
      setErrors(e instanceof ApiError ? e.errors : ['Tally is unreachable. Check Tailscale and try again.'])
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      play('error')
    } finally {
      pending.current = null
      setSaving(false)
    }
  }


  const v = cat ? categoryVisual(cat) : null
  const acctName = (a: number | null) => (a ? t.acct.get(a)?.name ?? 'Unknown' : 'None')
  const display = `${d.refund ? '−' : ''}${formatCents(cents)}`
  const mainActive = d.target === 'main'

  // The keypad is a raised panel that springs up from the bottom over the save button, and Done sends it back down.
  // It stays mounted (a layout animation here could be cut short and leave it stuck halfway off the screen).
  const reduce = useReducedMotion()
  const showPad = pad && !typing
  const mainOver = typeOver(c, over && showPad && mainActive, display)
  const padT = useSharedValue(showPad ? 1 : 0)
  const [padH, setPadH] = useState(420)
  useEffect(() => {
    padT.set(reduce ? (showPad ? 1 : 0) : withSpring(showPad ? 1 : 0, { damping: 30, stiffness: 320, mass: 0.9 }))
  }, [showPad]) // eslint-disable-line react-hooks/exhaustive-deps
  const padStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - padT.get()) * (padH + 30) }] }))
  // Read from the store, not this render: "Add a line" writes its line and opens the keypad on it in one go.
  const openPad = (target: string) => {
    if (!pad) Haptics.selectionAsync().catch(() => {})
    const now = useDraft.getState().d
    setOver(!!toCents((target === 'main' ? now.amount : now.split?.find((l) => l.key === target)?.amount) ?? ''))
    set({ target })
    setPad(true)
  }
  // Starting a split puts the keypad on line 2, which line 1 makes room for as it's typed.
  const splitNow = (on: boolean) => {
    setOver(false)
    setPad(on)
  }
  // Done after a split line's amount: a line with no category yet goes straight on to picking one.
  const closePad = () => {
    Haptics.selectionAsync().catch(() => {})
    setPad(false)
    setOver(false)
    const line = d.split?.find((l) => l.key === d.target)
    if (line && !line.category_id && toCents(line.amount)) router.push({ pathname: '/pick', params: { kind: 'category', line: line.key } })
  }

  // Kept from one render to the next (this screen renders on every key): a new one rebuilds the header's buttons, and a
  // tap in between was lost.
  const live = useLatest({ row: one.data, today: t.today })
  // A template or a quick action is one line: a split line can't start one, nor can an entry that already repeats
  // start a template. The same rule as the row menu.
  const canQuick = !!one.data && !one.data.split_group
  const canRepeat = canQuick && !one.data!.recurring_id
  const template = editing && one.data?.recurring_id ? t.b?.recurring.find((r) => r.id === one.data!.recurring_id) : undefined
  const header = useMemo(() => (
    <>
      {!embedded && <Stack.Screen options={{ title: editing ? 'Edit entry' : 'New entry' }} />}
      {!embedded && (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Cancel" onPress={() => { Keyboard.dismiss(); close() }} />
        </Stack.Toolbar>
      )}
      {editing && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Menu icon="ellipsis">
            <Stack.Toolbar.MenuAction icon="plus.square.on.square" onPress={() => {
              Haptics.selectionAsync().catch(() => {})
              setDup(true)
              set({ id: undefined, date: live.current.today ?? useDraft.getState().d.date, receipt: null, removeReceipt: false })
            }}>Duplicate to today</Stack.Toolbar.MenuAction>
            {/* An array, not a conditional child: a native menu is where Release builds drop those. */}
            {[...(canRepeat ? [
              <Stack.Toolbar.MenuAction key="repeat" icon="repeat" onPress={() => {
                const row = live.current.row
                if (row) repeatEntry(row, live.current.today, row.what || t.catOf(row).name)
              }}>Repeat…</Stack.Toolbar.MenuAction>,
            ] : []), ...(canQuick ? [
              <Stack.Toolbar.MenuAction key="quick" icon="bolt" onPress={() => {
                const row = live.current.row
                if (row) quickFromEntry(row, row.what || t.catOf(row).name)
              }}>Make quick action</Stack.Toolbar.MenuAction>,
            ] : [])]}
            <Stack.Toolbar.MenuAction icon="trash" destructive onPress={() => {
              const row = live.current.row
              leaving.current = true
              close()
              if (row) deleteTxns([row])
            }}>Delete</Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      )}
    </>
  ), [embedded, editing, canRepeat, canQuick]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {header}
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentInsetAdjustmentBehavior="automatic"
          automaticallyAdjustKeyboardInsets onScrollBeginDrag={() => { if (pad) setPad(false) }}
          contentContainerStyle={{ padding: space.l, gap: space.l, paddingBottom: space.xxl }}>
          {/* A split is spending made of other entries: no type to choose, no quick action to start from. */}
          {!d.split && <Segmented options={KINDS} value={d.kind} onChange={setKind} />}

          {/* Quick actions fill the draft; tapping the chosen one again takes it back out. They stay put while you
              type, so the form never jumps under your finger. */}
          {!editing && !id && !d.split && t.b && t.b.favorites.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.l }} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l }}>
              {t.b.favorites.map((f) => {
                const fc = t.cat.get(f.category_id)
                const fv = fc ? categoryVisual({ ...fc, icon: f.icon ?? fc.icon, color: f.color ?? fc.color }) : null
                const on = quick === f.id
                return <Chip key={f.id} label={f.label} selected={on} leading={fv ? <Mark kind="glyph" sf={fv.sf} md={fv.md} tint={tint(fv.tint)} size={28} /> : undefined}
                  onPress={() => {
                    const prev = quick != null ? t.b!.favorites.find((x) => x.id === quick) : undefined
                    // Undo keeps an amount you typed yourself, and drops one the quick action filled in.
                    const typed = prev?.amount ? '' : d.amount
                    if (on) { setQuick(null); set({ ...blank(d.date), date: d.date, amount: typed }); return }
                    setQuick(f.id)
                    set({ what: f.label, category_id: f.category_id, from_id: f.from_account_id, to_id: f.to_account_id, kind: fc?.type ?? 'Spending', amount: f.amount ? fromCents(f.amount) : typed })
                  }} />
              })}
            </ScrollView>
          )}

          <Tap feedback="opacity" onPress={() => openPad('main')} accessibilityLabel={`Amount ${mainOver.label ?? display}`}
            style={{ alignItems: 'center', paddingVertical: space.s }}>
            <Animated.View style={[shakeStyle, { borderRadius: radius.input, borderCurve: 'continuous', paddingHorizontal: space.s,
              backgroundColor: mainOver.fill }]}>
              <RollingText text={display} style={{ fontSize: display.length > 11 ? 46 : display.length > 9 ? 52 : 60, fontWeight: '700', letterSpacing: -1.5, color: d.amount ? c.label : c.label3 }} />
            </Animated.View>
            {d.split && (
              <Txt variant="sub" tone={left === 0 ? 'pos' : 'label2'} num>
                {left === 0 ? 'Split adds up' : `${formatCents(Math.abs(left))} ${left > 0 ? 'left to split' : 'over the total'}`}
              </Txt>
            )}
          </Tap>

          <View style={{ gap: space.s }}>
            <Field ref={whatInput} value={d.what} onChangeText={(what) => { if (!picked.current) set({ what }) }} placeholder={d.kind === 'Money in' ? 'Where from?' : 'What was it?'}
              placeholderTextColor={c.label3} onFocus={() => { picked.current = false; setTyping(true) }} onBlur={() => setTyping(false)} returnKeyType="done"
              autoCapitalize="words" autoCorrect={false} maxFontSizeMultiplier={1.4}
              style={{ fontSize: 22, fontWeight: '600', textAlign: 'center', color: c.label, paddingVertical: space.s }} />
            {suggestions.length > 0 && (
              <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.xs, flexGrow: 1, justifyContent: 'center' }}>
                {suggestions.map((x) => <Chip key={x.id} label={x.what} onPress={() => pickSuggestion(x)} />)}
              </ScrollView>
            )}
          </View>

          <Group>
            {!d.split && (
              <Row label="Category" value={cat?.name ?? 'Choose'} onPress={() => router.push({ pathname: '/pick', params: { kind: 'category' } })}
                leading={v ? <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={30} /> : <EmptyMark />} />
            )}
            {shape.from !== 'blank' && (
              <Row label="From" value={acctName(d.from_id)} sf="arrow.up.right" md="north_east" onPress={() => router.push({ pathname: '/pick', params: { kind: 'from' } })} />
            )}
            {shape.to !== 'blank' && (
              <Row label={shape.to === 'optional' ? 'To (optional)' : 'To'} value={acctName(d.to_id)} sf="arrow.down.left" md="south_west" onPress={() => router.push({ pathname: '/pick', params: { kind: 'to' } })} />
            )}
          </Group>

          <DateStrip />

          {/* A scheduled bill: where it came from. Changing this one entry leaves the series as it is. */}
          {template && (
            <Group footer="Changes here are for this entry only. The recurring entry sets the ones still to come.">
              <Row label={`From ${template.label}`} value={FREQ_LABEL[template.freq]} sf="repeat" md="repeat"
                onPress={() => router.push({ pathname: '/edit', params: { kind: 'recurring', id: String(template.id) } })} />
            </Group>
          )}

          {d.kind === 'Spending' && <SplitGroup canSplit={!editing} left={left} over={over && showPad} onAmount={openPad} onSplit={splitNow} />}

          <Group>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, minHeight: 50 }}>
              <Icon sf="text.alignleft" md="notes" size={18} color={c.label2} />
              <Field value={d.note} onChangeText={(note) => set({ note })} placeholder="Note" placeholderTextColor={c.label3} multiline
                onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} style={{ flex: 1, fontSize: 17, color: c.label, paddingTop: space.m, paddingBottom: space.m, textAlignVertical: 'center' }} />
            </View>
            <TagField onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} />
            <Receipt />
          </Group>

          {errors.length > 0 && (
            <View style={{ padding: space.m, borderRadius: radius.input, backgroundColor: c.panel, gap: 4 }} accessibilityLiveRegion="assertive">
              {errors.map((e) => <Txt key={e} variant="callout" tone="neg">{e}</Txt>)}
            </View>
          )}
        </ScrollView>

        <View accessibilityElementsHidden={showPad} importantForAccessibility={showPad ? 'no-hide-descendants' : 'auto'}
          style={{ backgroundColor: c.bg, paddingHorizontal: space.l, paddingTop: space.s, paddingBottom: typing ? space.s : insets.bottom + space.s }}>
          {done ? (
            <Animated.View entering={ZoomIn.duration(180)} accessibilityLiveRegion="polite"
              style={{ height: 52, borderRadius: radius.pill, backgroundColor: c.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s }}>
              <CheckDraw size={24} color={c.onInk} />
              <Txt variant="headline" tone="onInk">{editing ? 'Saved' : 'Added'}</Txt>
            </Animated.View>
          ) : (
            <Button label={saving ? 'Saving…' : editing ? 'Save changes' : cents ? `Add ${formatCents(cents)}` : 'Add entry'} onPress={save} disabled={saving} style={{ height: 52 }} />
          )}
        </View>

        <Animated.View pointerEvents={showPad ? 'auto' : 'none'} onLayout={(e) => setPadH(e.nativeEvent.layout.height)}
          accessibilityElementsHidden={!showPad} importantForAccessibility={showPad ? 'auto' : 'no-hide-descendants'}
          style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.panel, borderTopLeftRadius: radius.panel, borderTopRightRadius: radius.panel,
            borderCurve: 'continuous', paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: insets.bottom + space.xs, boxShadow: '0 -8px 30px rgba(0,0,0,0.22)' }, padStyle]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 36, paddingHorizontal: space.xs }}>
            <Txt variant="foot" tone="label2" style={{ flex: 1 }} numberOfLines={2}>{mainActive ? '' : 'Typing into the split line. Tap the total to edit it.'}</Txt>
            <Tap onPress={closePad} hitSlop={12} accessibilityLabel="Done with the amount"
              style={{ height: 34, paddingHorizontal: space.l + 2, borderRadius: radius.pill, backgroundColor: c.ink, justifyContent: 'center' }}>
              <Txt variant="callout" tone="onInk" style={{ fontWeight: '600' }}>Done</Txt>
            </Tap>
          </View>
          <Keypad onKey={onKey} onClear={onClear} />
        </Animated.View>
      </View>
    </>
  )
}
