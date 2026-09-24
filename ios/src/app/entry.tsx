// The composer: a modal with its own Cancel/Save. Amount on a big keypad, then what, category, accounts and date.
// A new entry starts empty: no category or account is guessed for you.
// New entries go through the outbox, so saving never fails just because the phone is off Tailscale.
import { useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, ScrollView, Switch, TextInput, View } from 'react-native'
import Animated, { SlideInDown, SlideOutDown, ZoomIn } from 'react-native-reanimated'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import { CheckDraw } from '@/components/CheckDraw'
import { Chip } from '@/components/Chip'
import { Icon } from '@/components/Icon'
import { Keypad } from '@/components/Keypad'
import { Mark } from '@/components/Mark'
import { Segmented } from '@/components/native/Segmented'
import { RollingText } from '@/components/Rolling'
import { useShake } from '@/components/Shake'
import { Group, Row } from '@/components/Row'
import { Button, Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { categoryVisual } from '@/icons/categories'
import { merchantKey } from '@/icons/merchants'
import { api, ApiError, unreachable, type CatType, type Txn } from '@/lib/api'
import { close } from '@/lib/nav'
import { deleteTxns } from '@/lib/actions'
import { useTransactions, invalidateAll } from '@/lib/data'
import { addDays, dayLabel } from '@/lib/dates'
import { blank, fromCents, fromTxn, press, toCents, toInputs, useDraft, type Draft } from '@/lib/draft'
import { formatCents } from '@/lib/money'
import { markFresh, useQuickFloat } from '@/lib/motion'
import { enqueue, newClientId, send } from '@/lib/outbox'
import { fits, HINT, SHAPES } from '@/lib/shapes'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { radius, space, useTheme } from '@/theme'

const KINDS: [CatType, string][] = [['Spending', 'Spent'], ['Money in', 'Income'], ['Transfer', 'Transfer'], ['Saving', 'Saving'], ['Loan', 'Loan']]

export default function Entry() {
  const { c, tint } = useTheme()
  const insets = useSafeAreaInsets()
  const t = useTally()
  const { id, mode, fav } = useLocalSearchParams<{ id?: string; mode?: string; fav?: string }>()
  const { d, set, reset, setLine } = useDraft()
  const [typing, setTyping] = useState(false)
  const [pad, setPad] = useState(!id)
  const [quick, setQuick] = useState<number | null>(fav ? Number(fav) : null) // the quick action filling the draft
  const [tagText, setTagText] = useState<string | null>(null) // raw text while editing tags
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [shakeStyle, shake] = useShake()
  const [errors, setErrors] = useState<string[]>([])
  const history = useTransactions({ limit: 600 }, !!t.b)
  // The entry being edited or duplicated, fetched by id: it may be older than the newest 600 used for suggestions.
  const one = useQuery({ queryKey: ['transactions', 'one', Number(id)], queryFn: () => api.transaction(Number(id)), enabled: !!id })
  const editing = !!id && mode !== 'duplicate'
  const loaded = useRef(false)

  // Seed the draft once: edit, duplicate, a quick action, or a blank entry with sensible defaults.
  useEffect(() => {
    if (loaded.current || !t.b) return
    const today = t.b.today
    if (id) {
      if (!one.data) return
      loaded.current = true
      reset(seed(one.data))
      return
    }
    loaded.current = true
    const f = fav ? t.b.favorites.find((x) => x.id === Number(fav)) : undefined
    if (f) {
      const cat = t.cat.get(f.category_id)
      reset({ ...blank(today), what: f.label, category_id: f.category_id, from_id: f.from_account_id, to_id: f.to_account_id,
        amount: f.amount ? fromCents(f.amount) : '', kind: cat?.type ?? 'Spending' })
      return
    }
    reset(blank(today))
    function seed(r: Txn): Draft {
      const d0 = fromTxn(r, t.catOf(r).type)
      return mode === 'duplicate' ? { ...d0, id: undefined, date: today, receipt: null } : d0
    }
  }, [t.b, one.data]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const pickSuggestion = (x: Txn) => {
    const ty = t.catOf(x).type
    set({ what: x.what, category_id: x.category_id, from_id: x.from_id, to_id: x.to_id, kind: ty })
    setTyping(false)
  }
  // A digit that can't go in (the amount is at its cap) shakes the figure instead of silently doing nothing.
  const onKey = (k: string) => {
    const line = d.target === 'main' ? null : d.split?.find((x) => x.key === d.target)
    const cur = line ? line.amount : d.amount
    const next = press(cur, k)
    if (next === cur && cur && k !== 'del') { refuse(); return }
    if (line) setLine(line.key, { amount: next })
    else set({ amount: next })
  }
  const refuse = () => { shake(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}) }
  const onClear = () => (d.target === 'main' ? set({ amount: '' }) : setLine(d.target, { amount: '' }))

  const splitSum = d.split?.reduce((n, l) => n + toCents(l.amount), 0) ?? 0
  const left = cents - splitSum

  async function save() {
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
    try {
      let saved: Txn[] = []
      if (editing) {
        saved = [await api.updateTxn(Number(id), lines[0])]
        if (d.removeReceipt && d.receipt) await api.deleteReceipt(Number(id))
      } else {
        const cid = newClientId()
        try {
          const r = await send(lines, cid)
          saved = Array.isArray(r) ? r : [r]
        } catch (e) {
          if (!unreachable(e)) throw e
          enqueue({ cid, lines, label: d.what || (cat?.name ?? 'Entry') })
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
          toast({ text: 'Saved on your phone. It will reach Tally when you are back on Tailscale.' })
          close()
          return
        }
      }
      if (d.photo && saved[0]) await api.uploadReceipt(saved[0].id, d.photo).catch(() => toast({ text: 'Saved, but the receipt photo did not upload.', tone: 'error' }))
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      markFresh(saved.map((x) => x.id))
      if (fav && !editing) useQuickFloat.getState().show(Number(fav), cents)
      await invalidateAll()
      setDone(true) // the button draws a check before the sheet goes
      await new Promise((r) => setTimeout(r, 560))
      close()
      toast({ text: editing ? 'Saved' : `Added ${formatCents(cents)}${cat && !d.split ? ` to ${cat.name}` : ''}` })
    } catch (e) {
      setErrors(e instanceof ApiError ? e.errors : ['Tally is unreachable. Check Tailscale and try again.'])
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
    } finally {
      setSaving(false)
    }
  }

  async function addPhoto(camera: boolean) {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 }
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts)
    if (r.canceled || !r.assets[0]) return
    const a = r.assets[0]
    set({ photo: { uri: a.uri, name: a.fileName ?? 'receipt.jpg', type: a.mimeType ?? 'image/jpeg' }, removeReceipt: false })
  }

  const v = cat ? categoryVisual(cat) : null
  const acctName = (a: number | null) => (a ? t.acct.get(a)?.name ?? 'Unknown' : 'None')
  const display = `${d.refund ? '−' : ''}${formatCents(cents)}`
  const mainActive = d.target === 'main'

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: editing ? 'Edit entry' : 'New entry', headerTransparent: false, headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Cancel" onPress={() => close()} />
      </Stack.Toolbar>
      {editing && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Menu icon="ellipsis">
            <Stack.Toolbar.MenuAction icon="plus.square.on.square" onPress={() => { close(); setTimeout(() => router.push({ pathname: '/entry', params: { id: String(id), mode: 'duplicate' } }), 350) }}>Duplicate to today</Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction icon="trash" destructive onPress={() => {
              const row = one.data
              close()
              if (row) deleteTxns([row])
            }}>Delete</Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      )}
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentInsetAdjustmentBehavior="automatic"
          onScrollBeginDrag={() => setPad(false)}
          contentContainerStyle={{ padding: space.l, gap: space.l, paddingBottom: space.xxl }}>
          <Segmented options={KINDS} value={d.kind} onChange={setKind} />

          {/* Quick actions fill the draft; tapping the chosen one again takes it back out. */}
          {!editing && !id && t.b && t.b.favorites.length > 0 && (quick != null || (!d.what && !d.amount)) && (
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

          <Tap feedback="opacity" onPress={() => { set({ target: 'main' }); setPad(true) }} accessibilityLabel={`Amount ${display}`}
            style={{ alignItems: 'center', paddingVertical: space.s }}>
            <Animated.View style={shakeStyle}>
              <RollingText text={display} style={{ fontSize: display.length > 11 ? 46 : display.length > 9 ? 52 : 60, fontWeight: '700', letterSpacing: -1.5, color: d.amount ? c.label : c.label3 }} />
            </Animated.View>
            {d.split && (
              <Txt variant="sub" tone={left === 0 ? 'pos' : 'label2'} num>
                {left === 0 ? 'Split adds up' : `${formatCents(Math.abs(left))} ${left > 0 ? 'left to split' : 'over the total'}`}
              </Txt>
            )}
          </Tap>

          <View style={{ gap: space.s }}>
            <TextInput value={d.what} onChangeText={(what) => set({ what })} placeholder={d.kind === 'Money in' ? 'Where from?' : 'What was it?'}
              placeholderTextColor={c.label3} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} returnKeyType="done"
              autoCapitalize="words" autoCorrect={false} maxFontSizeMultiplier={1.4}
              style={{ fontSize: 22, fontWeight: '600', textAlign: 'center', color: c.label, paddingVertical: space.s }} />
            {suggestions.length > 0 && (
              <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.xs }}>
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
            <Row label="Date" value={dayLabel(d.date, t.b?.today)} sf="calendar" md="calendar_today" onPress={() => router.push({ pathname: '/pick', params: { kind: 'date' } })} />
          </Group>

          {t.b && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.l, marginTop: -space.s }} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l }}>
              <Chip label="Today" selected={d.date === t.b.today} onPress={() => set({ date: t.b!.today })} />
              <Chip label="Yesterday" selected={d.date === addDays(t.b.today, -1)} onPress={() => set({ date: addDays(t.b!.today, -1) })} />
              <Chip label={dayLabel(addDays(t.b.today, -2), t.b.today)} selected={d.date === addDays(t.b.today, -2)} onPress={() => set({ date: addDays(t.b!.today, -2) })} />
            </ScrollView>
          )}

          {d.kind === 'Spending' && (
            <Group footer={d.split ? 'Each line is saved as its own entry, linked together, so budgets see the right categories.' : undefined}>
              <Row label="Refund" sub={d.refund ? 'Counts as money back in this category' : undefined} sf="arrow.uturn.backward" md="undo"
                trailing={<Switch value={d.refund} onValueChange={(refund) => set({ refund })} />} chevron={false} />
              {!editing && (
                <Row label="Split across categories" sf="square.split.2x1" md="call_split" chevron={false}
                  trailing={<Switch value={!!d.split} onValueChange={(on) => set(on
                    ? { split: [{ key: 'a', category_id: d.category_id, amount: d.amount }, { key: 'b', category_id: null, amount: '' }], target: 'b' }
                    : { split: null, target: 'main' })} />} />
              )}
              {d.split?.map((l, i) => {
                const lc = l.category_id ? t.cat.get(l.category_id) : undefined
                const lv = lc ? categoryVisual(lc) : null
                const active = d.target === l.key
                return (
                  <Row key={l.key} label={lc?.name ?? `Line ${i + 1}`}
                    leading={lv ? <Mark kind="glyph" sf={lv.sf} md={lv.md} tint={tint(lv.tint)} size={30} /> : <EmptyMark />}
                    onPress={() => router.push({ pathname: '/pick', params: { kind: 'category', line: l.key } })}
                    trailing={
                      <Tap feedback="opacity" onPress={() => { set({ target: l.key }); setPad(true) }} hitSlop={8}
                        style={{ minWidth: 88, height: 34, borderRadius: radius.pill, paddingHorizontal: space.m, alignItems: 'flex-end', justifyContent: 'center', backgroundColor: active ? c.ink : c.fill }}>
                        <Txt variant="callout" num tone={active ? 'onInk' : 'label'} style={{ fontWeight: '600' }}>{formatCents(toCents(l.amount))}</Txt>
                      </Tap>
                    } chevron={false} />
                )
              })}
              {d.split && (
                <Row label="Add a line" sf="plus" md="add" chevron={false}
                  onPress={() => { const key = Math.random().toString(36).slice(2, 7); set({ split: [...d.split!, { key, category_id: null, amount: left > 0 ? fromCents(left) : '' }], target: key }) }} />
              )}
            </Group>
          )}

          <Group>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, minHeight: 50 }}>
              <Icon sf="text.alignleft" md="notes" size={18} color={c.label2} />
              <TextInput value={d.note} onChangeText={(note) => set({ note })} placeholder="Note" placeholderTextColor={c.label3} multiline
                onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} style={{ flex: 1, fontSize: 17, color: c.label, paddingVertical: space.m }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, minHeight: 50 }}>
              <Icon sf="number" md="tag" size={18} color={c.label2} />
              <TextInput value={tagText ?? d.tags.join(' ')} placeholder="Tags, separated by spaces" placeholderTextColor={c.label3}
                autoCapitalize="none" autoCorrect={false} onFocus={() => setTyping(true)} onBlur={() => { setTyping(false); setTagText(null) }}
                onChangeText={(v) => { setTagText(v); set({ tags: v.split(/\s+/).map((x) => x.replace(/^#/, '').toLowerCase()).filter(Boolean) }) }}
                style={{ flex: 1, fontSize: 17, color: c.label, paddingVertical: space.m }} />
            </View>
            <Receipt d={d} onAdd={addPhoto} onRemove={() => set({ photo: null, removeReceipt: true })} />
          </Group>

          {errors.length > 0 && (
            <View style={{ padding: space.m, borderRadius: radius.input, backgroundColor: c.panel, gap: 4 }} accessibilityLiveRegion="assertive">
              {errors.map((e) => <Txt key={e} variant="callout" tone="neg">{e}</Txt>)}
            </View>
          )}
        </ScrollView>

        {/* The keypad is its own raised panel while you type an amount, with Done to put it away; the save button
            only shows once it's gone, since the amount is the first thing typed and there's more to fill in after. */}
        {!typing && pad ? (
          <Animated.View entering={SlideInDown.duration(260)} exiting={SlideOutDown.duration(200)}
            style={{ backgroundColor: c.panel, borderTopLeftRadius: radius.panel, borderTopRightRadius: radius.panel, borderCurve: 'continuous',
              paddingHorizontal: space.l, paddingTop: space.s, paddingBottom: insets.bottom + space.s, boxShadow: '0 -6px 24px rgba(0,0,0,0.18)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 }}>
              <Txt variant="foot" tone="label2" style={{ flex: 1 }}>{mainActive ? '' : 'Typing into the split line. Tap the total to edit it.'}</Txt>
              <Tap feedback="opacity" onPress={() => setPad(false)} hitSlop={10} accessibilityLabel="Done with the amount"
                style={{ height: 32, paddingHorizontal: space.l, borderRadius: radius.pill, backgroundColor: c.ink, justifyContent: 'center' }}>
                <Txt variant="callout" tone="onInk" style={{ fontWeight: '600' }}>Done</Txt>
              </Tap>
            </View>
            <Keypad onKey={onKey} onClear={onClear} />
          </Animated.View>
        ) : (
          <View style={{ backgroundColor: c.bg, paddingHorizontal: space.l, paddingTop: space.s, paddingBottom: typing ? space.s : insets.bottom + space.s }}>
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
        )}
      </KeyboardAvoidingView>
    </>
  )
}

function EmptyMark() {
  const { c } = useTheme()
  return <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: c.label3, borderStyle: 'dashed' }} />
}

function Receipt({ d, onAdd, onRemove }: { d: Draft; onAdd: (camera: boolean) => void; onRemove: () => void }) {
  const { c } = useTheme()
  const uri = d.photo?.uri ?? (d.receipt && !d.removeReceipt ? api.receiptUrl(d.receipt) : null)
  if (uri) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.m, paddingLeft: space.l }}>
        <Image source={{ uri }} style={{ width: 48, height: 64, borderRadius: 8 }} contentFit="cover" />
        <Txt variant="body" style={{ flex: 1 }}>Receipt</Txt>
        <Tap feedback="opacity" onPress={onRemove} hitSlop={10}><Txt variant="callout" tone="neg">Remove</Txt></Tap>
      </View>
    )
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, minHeight: 50 }}>
      <Icon sf="doc.text.viewfinder" md="document_scanner" size={18} color={c.label2} />
      <Txt variant="body" tone="label3" style={{ flex: 1 }}>Receipt</Txt>
      {process.env.EXPO_OS === 'ios' && <Tap feedback="opacity" onPress={() => onAdd(true)} hitSlop={8}><Icon sf="camera" md="photo_camera" size={20} color={c.label} /></Tap>}
      <Tap feedback="opacity" onPress={() => onAdd(false)} hitSlop={8}><Icon sf="photo" md="image" size={20} color={c.label} /></Tap>
    </View>
  )
}
