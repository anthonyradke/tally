// The new-entry composer's pages and small parts (app/new.tsx holds the flow): "What was it?", the category and
// account pages, the extras on the review, the progress dots and the keys and pill around the keypad.
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react'
import { ScrollView, Switch, TextInput, View } from 'react-native'
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { AccountMark } from './AccountMark'
import { Chip } from './Chip'
import { EASE } from './ease'
import { Field } from './Field'
import { Icon } from './Icon'
import { Mark } from './Mark'
import { Money } from './Money'
import { PAGE_MS } from './Pages'
import { Receipt } from './Receipt'
import { Group, Row } from './Row'
import { TagField } from './TagField'
import { Tap } from './Tap'
import { Txt } from './Txt'
import { categoryVisual, KIND_LABEL } from '@/icons/categories'
import type { CatType, Kind, Txn } from '@/lib/api'
import { exactPlace, KIND_NAME, places } from '@/lib/compose'
import { dayLabel } from '@/lib/dates'
import { useDraft } from '@/lib/draft'
import { monthsNow } from '@/lib/months'
import { SHAPES } from '@/lib/shapes'
import { useTally } from '@/lib/tally'
import { radius, space, useTheme } from '@/theme'

const KIND_ORDER: Kind[] = ['cash', 'card', 'investment', 'loan']

/** + − = on the amount page: small round keys above the keypad. */
export function OpKey({ label, hint, onPress, on }: { label: string; hint: string; onPress: () => void; on?: boolean }) {
  const { c } = useTheme()
  return (
    <Tap onPress={onPress} accessibilityLabel={hint} style={{ width: 44, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.ink : c.fill }}>
      <Txt style={{ fontSize: 22, fontWeight: '600', color: on ? c.onInk : c.label, marginTop: -2 }}>{label}</Txt>
    </Tap>
  )
}

/** On the amount page when the entry isn't for today ("Add another" keeps the last entry's day): the day, so it isn't
 *  a surprise on the review. Tapping it puts the entry back on today. */
export function DatePill() {
  const { c } = useTheme()
  const t = useTally()
  const { d, set } = useDraft()
  if (d.date === t.today) return null
  const label = dayLabel(d.date, t.today)
  return (
    <Tap feedback="opacity" onPress={() => { Haptics.selectionAsync().catch(() => {}); set({ date: t.today }) }} hitSlop={8}
      accessibilityLabel={`Dated ${label}. Change to today`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingHorizontal: space.m, height: 30, borderRadius: radius.pill, backgroundColor: c.fill }}>
      <Icon sf="calendar" md="calendar_today" size={13} color={c.label2} />
      <Txt variant="sub" tone="label">{label}</Txt>
      <Icon sf="xmark" md="close" size={10} color={c.label3} weight="bold" />
    </Tap>
  )
}

/** A step's question, at the top of its page. */
export function Heading({ text }: { text: string }) {
  return <Txt variant="title2" accessibilityRole="header" style={{ paddingHorizontal: space.xs, marginBottom: -space.xs }}>{text}</Txt>
}

/** One step in the progress dots. The current one stretches into a dash; both the stretch and the fill ease over. */
export function Dot({ on, done, label, onPress }: { on: boolean; done: boolean; label: string; onPress: () => void }) {
  const { c } = useTheme()
  const reduce = useReducedMotion()
  const w = useSharedValue(on ? 18 : 6)
  const k = useSharedValue(done ? 1 : 0)
  useEffect(() => { w.set(reduce ? (on ? 18 : 6) : withTiming(on ? 18 : 6, { duration: 300, easing: EASE })) }, [on]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { k.set(reduce ? (done ? 1 : 0) : withTiming(done ? 1 : 0, { duration: 300, easing: EASE })) }, [done]) // eslint-disable-line react-hooks/exhaustive-deps
  const from = c.fillStrong, to = c.ink
  const style = useAnimatedStyle(() => ({ width: w.get(), backgroundColor: interpolateColor(k.get(), [0, 1], [from, to]) }))
  return (
    <Tap feedback="opacity" onPress={on ? undefined : onPress} hitSlop={6} accessibilityLabel={label} accessibilityState={{ selected: on }}>
      <Animated.View style={[{ height: 6, borderRadius: 3 }, style]} />
    </Tap>
  )
}

export function CatMark({ id, size = 30 }: { id: number; size?: number }) {
  const t = useTally()
  const { tint } = useTheme()
  const x = t.cat.get(id)
  if (!x) return null
  const v = categoryVisual(x)
  return <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={size} />
}

/** What the composer's Next button calls on "What was it?", so it does what Return does. */
export interface WhatHandle { submit: () => void }

/** "What was it?": a name, with past places under it. Typing matches every kind; picking one copies its category and
 *  accounts (and its kind, said under the row). A name typed in full that is one past place of this kind counts as
 *  picking it, whether it's left with Return or the bar's Next (`ref`), except on a page opened from the review
 *  (`fixing`): there it only keeps the new name, and the category and accounts already set stay as they are.
 *  `onSubmit` moves on without a pick. */
export function What({ ref, history, fixing, onPick, onSubmit }: { ref?: Ref<WhatHandle>; history: Txn[]; fixing: boolean; onPick: (x: Txn) => void; onSubmit: () => void }) {
  const { c } = useTheme()
  const t = useTally()
  const { d, set } = useDraft()
  // Focus once the page has slid in: focusing it while it's still off to the side can drag its parent along with it.
  const input = useRef<TextInput>(null)
  useEffect(() => { const id = setTimeout(() => input.current?.focus(), PAGE_MS); return () => clearTimeout(id) }, [])
  // Losing focus can make iOS send one last change with the text it still had ("Mc"), landing after a pick and
  // overwriting the name. After a pick, nothing the field sends counts until it's focused again.
  const picked = useRef(false)
  const pick = (x: Txn) => { picked.current = true; input.current?.blur(); onPick(x) }
  const submit = () => {
    const x = fixing ? undefined : exactPlace(history, t.catOf, d.what, d.kind)
    if (x) pick(x)
    else onSubmit()
  }
  useImperativeHandle(ref, () => ({ submit }))
  const list = useMemo(() => places(history, t.catOf, { text: d.what, kind: d.kind, category: d.category_id }),
    [d.what, d.kind, d.category_id, history]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.l }}>
      <Field ref={input} value={d.what} onChangeText={(what) => { if (!picked.current) set({ what }) }} onFocus={() => { picked.current = false }}
        placeholder={d.kind === 'Money in' ? 'Where from?' : 'What was it?'} placeholderTextColor={c.label3} returnKeyType="next" onSubmitEditing={submit} submitBehavior="submit" autoCapitalize="words" autoCorrect={false}
        maxFontSizeMultiplier={1.4} style={{ fontSize: 22, fontWeight: '600', color: c.label, paddingVertical: space.s, paddingHorizontal: space.xs }} />
      {list.length > 0 && (
        <Group header={d.what ? 'Matches' : 'Recent'}>
          {list.map((x) => {
            const xc = t.catOf(x)
            return (
              <Row key={x.id} label={x.what} sub={xc.type === d.kind ? xc.name : `${xc.name}, in ${KIND_NAME[xc.type]}`} chevron={false} onPress={() => pick(x)}
                leading={<CatMark id={x.category_id} />} value={<Money cents={x.amount} tone="neutral" muted variant="callout" />} />
            )
          })}
        </Group>
      )}
    </ScrollView>
  )
}

/** The category page. Transfer's list is short (card payments), and money moved to savings or a loan lives under
 *  Saving and Loan, so it points there. */
export function Categories({ heading, onPick, onKind }: { heading: string; onPick: (id: number) => void; onKind: (k: CatType) => void }) {
  const { c, tint } = useTheme()
  const t = useTally()
  const { d } = useDraft()
  const list = (t.b?.categories ?? []).filter((x) => x.type === d.kind && (x.active || x.id === d.category_id))
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.l }}>
      <Heading text={heading} />
      {list.length > 0 && (
        <Group>
          {list.map((x) => {
            const v = categoryVisual(x)
            return <Row key={x.id} label={x.name} chevron={false} onPress={() => onPick(x.id)}
              leading={<Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={30} />}
              trailing={x.id === d.category_id ? <Icon sf="checkmark" md="check" size={16} color={c.ink} weight="bold" /> : undefined} />
          })}
        </Group>
      )}
      {d.kind === 'Transfer' && (
        <View style={{ gap: space.s, paddingHorizontal: space.xs }}>
          <Txt variant="callout" tone="label2">
            {list.length ? 'Moving money to savings or paying off a loan? Those are under Saving and Loan.' : 'No transfer categories yet. Money moved to savings or a loan goes under Saving and Loan.'}
          </Txt>
          <View style={{ flexDirection: 'row', gap: space.s }}>
            {(['Saving', 'Loan'] as const).map((k) => <Chip key={k} label={KIND_NAME[k]} onPress={() => onKind(k)} />)}
          </View>
        </View>
      )}
    </ScrollView>
  )
}

export function Accounts({ side, heading, onPick }: { side: 'from' | 'to'; heading: string; onPick: () => void }) {
  const t = useTally()
  const { c } = useTheme()
  const { d, set } = useDraft()
  if (!t.b) return null
  const bal = monthsNow(t.b).cur?.balances ?? {}
  const current = side === 'from' ? d.from_id : d.to_id
  const other = side === 'from' ? d.to_id : d.from_id // money can't move from an account to itself
  const choose = (id: number | null) => { set(side === 'from' ? { from_id: id } : { to_id: id }); onPick() }
  const check = (on: boolean) => (on ? <Icon sf="checkmark" md="check" size={16} color={c.ink} weight="bold" /> : <View style={{ width: 16 }} />)
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.l }}>
      <Heading text={heading} />
      {SHAPES[d.kind][side] === 'optional' && <Group><Row label="None" chevron={false} onPress={() => choose(null)} trailing={check(current == null)} /></Group>}
      {KIND_ORDER.map((k) => {
        const list = t.b!.accounts.filter((a) => a.kind === k && a.id !== other && (a.active || a.id === current))
        if (!list.length) return null
        return (
          <Group key={k} header={KIND_LABEL[k]}>
            {list.map((a) => (
              <Row key={a.id} label={a.name} chevron={false} onPress={() => choose(a.id)} trailing={check(a.id === current)}
                leading={<AccountMark a={a} size={30} />}
                value={<Money cents={bal[String(a.id)] ?? a.start_balance} tone="neutral" muted variant="callout" />} />
            ))}
          </Group>
        )
      })}
    </ScrollView>
  )
}

/** The rarely needed bits, last: refund, split, note, tags (with the ones in use offered, as in the editor) and a
 *  receipt. */
export function Extras({ onSplit }: { onSplit: () => void }) {
  const { c } = useTheme()
  const { d, set } = useDraft()
  return (
    <Group>
      {d.kind === 'Spending' && (
        <Row label="Refund" sub={d.refund ? 'Counts as money back in this category' : undefined} sf="arrow.uturn.backward" md="undo" chevron={false}
          trailing={<Switch value={d.refund} onValueChange={(refund) => set({ refund })} />} />
      )}
      {d.kind === 'Spending' && <Row label="Split across categories" sf="square.split.2x1" md="call_split" onPress={onSplit} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, minHeight: 50 }}>
        <Icon sf="text.bubble" md="chat" size={18} color={c.label2} />
        <Field value={d.note} onChangeText={(note) => set({ note })} placeholder="Note" placeholderTextColor={c.label3} multiline
          style={{ flex: 1, fontSize: 17, color: c.label, paddingTop: space.m, paddingBottom: space.m, textAlignVertical: 'center' }} />
      </View>
      <TagField />
      <Receipt />
    </Group>
  )
}
