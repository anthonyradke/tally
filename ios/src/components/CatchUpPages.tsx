// The pages of a catch-up (app/catchup.tsx): where the account left off, what it was, the amount, and the two lists
// (every category, the other account of a transfer) that the amount page sends you to.
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { ScrollView, TextInput, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { categoryVisual, KIND_LABEL } from '@/icons/categories'
import type { Account, CatType, Kind, Txn } from '@/lib/api'
import { otherSide, suggest, usualCategories } from '@/lib/catchup'
import { dayLabel, fromISO } from '@/lib/dates'
import { press, toCents, useDraft } from '@/lib/draft'
import { formatCents } from '@/lib/money'
import { monthsNow } from '@/lib/months'
import { SHAPES } from '@/lib/shapes'
import { useTally } from '@/lib/tally'
import { radius, space, useTheme } from '@/theme'
import { AccountMark } from './AccountMark'
import { Chip } from './Chip'
import { DateStrip } from './DateStrip'
import { Field } from './Field'
import { Icon } from './Icon'
import { Keypad } from './Keypad'
import { Mark } from './Mark'
import { Money } from './Money'
import { PAGE_MS } from './Pages'
import { Hairline } from './Panel'
import { RollingText } from './Rolling'
import { Group, Row } from './Row'
import { Tap } from './Tap'
import { TxnRow } from './TxnRow'
import { Txt } from './Txt'

const TYPES: CatType[] = ['Spending', 'Money in', 'Transfer', 'Saving', 'Loan']
const KIND_ORDER: Kind[] = ['cash', 'card', 'investment', 'loan']
const check = (on: boolean, color: string) => (on ? <Icon sf="checkmark" md="check" size={16} color={color} weight="bold" /> : <View style={{ width: 16 }} />)

function Heading({ text }: { text: string }) {
  return <Txt variant="title2" accessibilityRole="header" style={{ paddingHorizontal: space.xs, marginBottom: -space.xs }}>{text}</Txt>
}

function CatMark({ id, size = 30 }: { id: number; size?: number }) {
  const t = useTally()
  const { tint } = useTheme()
  const x = t.cat.get(id)
  if (!x) return null
  const v = categoryVisual(x)
  return <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={size} />
}

/** The account being caught up, small, at the top of a line's pages. */
export function AccountLine({ a, count }: { a: Account; count: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s }}>
      <AccountMark a={a} size={22} />
      <Txt variant="sub" style={{ fontWeight: '600' }}>{a.name}</Txt>
      {count > 0 && <Txt variant="sub" tone="label2">{count} added</Txt>}
    </View>
  )
}

/** First page: pick the account, then see its newest entries, which is where the bank's list picks up. */
export function LeftOff({ accounts, acct, onAcct, rows, loading, added }: {
  accounts: Account[]; acct: Account; onAcct: (id: number) => void; rows: Txn[]; loading: boolean; added: number
}) {
  const { c } = useTheme()
  const t = useTally()
  if (!t.b) return null
  const today = t.b.today
  const newest = rows[0]?.date
  const ago = newest ? Math.round((fromISO(today).getTime() - fromISO(newest).getTime()) / 864e5) : 0
  return (
    <ScrollView contentContainerStyle={{ paddingVertical: space.s, gap: space.l }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l }}>
        {accounts.map((a) => <Chip key={a.id} label={a.name} selected={a.id === acct.id} leading={<AccountMark a={a} size={28} />} onPress={() => onAcct(a.id)} />)}
      </ScrollView>
      <View style={{ paddingHorizontal: space.l + space.xs, gap: 4 }}>
        <Txt variant="title2" accessibilityRole="header">Where you left off</Txt>
        <Txt variant="callout" tone="label2">
          {loading && !rows.length ? ' '
            : !newest ? `Nothing is on ${acct.name} yet.`
            : `The newest entry on ${acct.name} is from ${ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${dayLabel(newest, today)}, ${ago} days ago`}. Pick up after it in the bank's app.`}
        </Txt>
        {added > 0 && <Txt variant="callout" tone="label2">{added === 1 ? '1 entry' : `${added} entries`} added to it just now.</Txt>}
      </View>
      {rows.length > 0 && (
        <View style={{ marginHorizontal: space.l, backgroundColor: c.panel, borderRadius: radius.panel, borderCurve: 'continuous', overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <View key={r.id}>
              {i > 0 && <Hairline inset={space.l + 40 + space.m} />}
              <TxnRow t={r} c={t.catOf(r)} acct={t.acct} mark={t.markFor(r.what)} today={today} showDate={dayLabel(r.date, today)}
                padTop={i === 0 ? space.xs : 0} padBottom={i === rows.length - 1 ? space.xs : 0} />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  )
}

/** The entry just added, with a way to take it back. Queued offline, there's nothing to take back yet. */
export interface Last { row: Txn | null; label: string; cents: number; error?: string }

/** "What was it?": the day (it stays from one entry to the next) and the name, with this account's usual places under
 *  it. Picking one copies its category and accounts and moves on. */
export function What({ acct, history, count, last, onUndo, onPick, onSubmit }: {
  acct: Account; history: Txn[]; count: number; last: Last | null; onUndo: () => void; onPick: (x: Txn) => void; onSubmit: () => void
}) {
  const { c } = useTheme()
  const t = useTally()
  const { d, set } = useDraft()
  const input = useRef<TextInput>(null)
  useEffect(() => { const id = setTimeout(() => input.current?.focus(), PAGE_MS); return () => clearTimeout(id) }, [])
  // Losing focus can make iOS send one last change with the text it still had ("Mc"), landing after a pick and
  // overwriting the name (as in the composer). After a pick, nothing the field sends counts until it's focused again.
  const picked = useRef(false)
  const pick = (x: Txn) => { picked.current = true; input.current?.blur(); onPick(x) }
  const list = useMemo(() => suggest(history, acct.id, d.what), [history, acct.id, d.what])
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.l }}>
      <AccountLine a={acct} count={count} />
      {last && (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingLeft: space.l, paddingRight: space.s, minHeight: 44, borderRadius: radius.pill, backgroundColor: c.panel }}>
          <Icon sf={last.row ? 'checkmark.circle.fill' : 'icloud.and.arrow.up'} md={last.row ? 'check_circle' : 'cloud_upload'} size={16} color={last.error ? c.neg : last.row ? c.pos : c.warn} />
          <Txt variant="sub" numberOfLines={1} style={{ flex: 1 }} tone={last.error ? 'neg' : 'label'}>
            {last.error ?? (last.row ? `Added ${last.label}, ${formatCents(last.cents)}` : `${last.label} is saved on your phone for now.`)}
          </Txt>
          {last.row && !last.error && (
            <Tap feedback="opacity" onPress={onUndo} hitSlop={8} style={{ paddingHorizontal: space.m, height: 32, justifyContent: 'center' }}>
              <Txt variant="sub" style={{ fontWeight: '600' }}>Undo</Txt>
            </Tap>
          )}
        </View>
      )}
      <DateStrip />
      <Field ref={input} value={d.what} onChangeText={(what) => { if (!picked.current) set({ what }) }} onFocus={() => { picked.current = false }} placeholder="What was it?"
        placeholderTextColor={c.label3} returnKeyType="next" onSubmitEditing={onSubmit} submitBehavior="submit" autoCapitalize="words" autoCorrect={false}
        maxFontSizeMultiplier={1.4} style={{ fontSize: 22, fontWeight: '600', color: c.label, paddingVertical: space.s, paddingHorizontal: space.xs }} />
      {list.length > 0 && (
        <Group header={d.what ? 'Matches' : `Usual on ${acct.name}`}>
          {list.map((x) => (
            <Row key={x.id} label={x.what} sub={t.catOf(x).name} chevron={false} onPress={() => pick(x)} leading={<CatMark id={x.category_id} />}
              value={<Money cents={x.amount} tone="neutral" muted variant="callout" />} />
          ))}
        </Group>
      )}
    </ScrollView>
  )
}

/** The amount on the keypad, with the category as a row of chips (this account's usual ones) and, for a transfer,
 *  the other account. A lookalike already in Tally is pointed out, not refused. */
export function Amount({ acct, history, count, lookalike, errors, shake, onWhat, onCategory, onMoreCategories, onOther, onFlip, onRefuse }: {
  acct: Account; history: Txn[]; count: number; lookalike: Txn | null; errors: string[]; shake: object
  onWhat: () => void; onCategory: (id: number) => void; onMoreCategories: () => void; onOther: () => void; onFlip: () => void; onRefuse: () => void
}) {
  const { c, tint } = useTheme()
  const t = useTally()
  const { d, set } = useDraft()
  const cents = toCents(d.amount)
  const usual = useMemo(() => usualCategories(history, acct.id), [history, acct.id])
  const chips = [...(d.category_id ? [d.category_id] : []), ...usual.filter((x) => x !== d.category_id)]
    .map((id) => t.cat.get(id)).filter((x) => x && (x.active || x.id === d.category_id))
  const two = SHAPES[d.kind].from !== 'blank' && SHAPES[d.kind].to !== 'blank'
  const o = otherSide(d, acct.id)
  const other = o.id ? t.acct.get(o.id) : undefined
  return (
    <View style={{ flex: 1, paddingTop: space.s, gap: space.m }}>
      <AccountLine a={acct} count={count} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingHorizontal: space.l }}>
        <Animated.View style={shake}>
          <RollingText text={`${d.refund ? '−' : ''}${formatCents(cents)}`} style={{ fontSize: 64, fontWeight: '700', letterSpacing: -1.5, color: d.amount ? c.label : c.label3 }} />
        </Animated.View>
        <Tap feedback="opacity" onPress={onWhat} hitSlop={8} accessibilityLabel={`${d.what || 'No name'}. Change`}>
          <Txt variant="callout" tone="label2" numberOfLines={1}>{d.what || 'Add a name'}</Txt>
        </Tap>
        {lookalike && (
          <Txt variant="foot" tone="warn" numberOfLines={2} style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
            {`Already in Tally? ${lookalike.what || t.catOf(lookalike).name}, ${dayLabel(lookalike.date, t.b?.today)}, is the same amount.`}
          </Txt>
        )}
        {errors.map((e) => <Txt key={e} variant="foot" tone="neg" style={{ textAlign: 'center' }}>{e}</Txt>)}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l }}>
        {chips.map((x) => {
          const v = categoryVisual(x!)
          return <Chip key={x!.id} label={x!.name} selected={x!.id === d.category_id} onPress={() => onCategory(x!.id)}
            leading={<Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={28} />} />
        })}
        {d.kind === 'Spending' && d.category_id != null && <Chip label="Refund" selected={d.refund} onPress={() => set({ refund: !d.refund })} />}
        <Chip label={chips.length ? 'More' : 'Category'} onPress={onMoreCategories} />
      </ScrollView>
      {two && (
        <View style={{ flexDirection: 'row', gap: space.s, marginHorizontal: space.l }}>
          <Tap onPress={onOther} style={{ flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: c.panel, flexDirection: 'row', alignItems: 'center', gap: space.s, paddingLeft: space.xs, paddingRight: space.l }}>
            {other ? <AccountMark a={other} size={34} /> : <View style={{ width: space.s }} />}
            <Txt variant="sub" numberOfLines={1} style={{ flex: 1, fontWeight: '600' }}>
              {`${o.side === 'to' ? 'To' : 'From'} ${other?.name ?? (o.side === 'to' && SHAPES[d.kind].to === 'optional' ? 'no account' : 'which account?')}`}
            </Txt>
            <Icon sf="chevron.right" md="chevron_right" size={13} color={c.label3} weight="bold" />
          </Tap>
          <Tap onPress={onFlip} accessibilityLabel={o.side === 'to' ? 'Money came in instead' : 'Money went out instead'}
            style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.panel, alignItems: 'center', justifyContent: 'center' }}>
            <Icon sf="arrow.left.arrow.right" md="swap_horiz" size={17} color={c.label} />
          </Tap>
        </View>
      )}
      <Keypad onKey={(k) => {
        const n = press(d.amount, k)
        if (n === d.amount && d.amount && k !== 'del') onRefuse()
        else set({ amount: n })
      }} onClear={() => set({ amount: '' })} />
    </View>
  )
}

/** Every category, by type, for one the chips don't have. */
export function Categories({ onPick }: { onPick: (id: number) => void }) {
  const { c } = useTheme()
  const t = useTally()
  const d = useDraft((s) => s.d)
  const all = t.b?.categories ?? []
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.l }}>
      <Heading text="Category" />
      {TYPES.map((ty) => {
        const list = all.filter((x) => x.type === ty && (x.active || x.id === d.category_id))
        if (!list.length) return null
        return (
          <Group key={ty} header={ty}>
            {list.map((x) => (
              <Row key={x.id} label={x.name} chevron={false} onPress={() => onPick(x.id)} leading={<CatMark id={x.id} />} trailing={check(x.id === d.category_id, c.ink)} />
            ))}
          </Group>
        )
      })}
    </ScrollView>
  )
}

/** The other account of a transfer, saving or loan payment. */
export function Other({ acct, onPick }: { acct: Account; onPick: (id: number | null) => void }) {
  const { c } = useTheme()
  const t = useTally()
  const d = useDraft((s) => s.d)
  if (!t.b) return null
  const o = otherSide(d, acct.id)
  const bal = monthsNow(t.b).cur?.balances ?? {}
  const groups: ReactNode[] = KIND_ORDER.map((k) => {
    const list = t.b!.accounts.filter((a) => a.kind === k && a.id !== acct.id && (a.active || a.id === o.id))
    if (!list.length) return null
    return (
      <Group key={k} header={KIND_LABEL[k]}>
        {list.map((a) => (
          <Row key={a.id} label={a.name} chevron={false} onPress={() => onPick(a.id)} trailing={check(a.id === o.id, c.ink)} leading={<AccountMark a={a} size={30} />}
            value={<Money cents={bal[String(a.id)] ?? a.start_balance} tone="neutral" muted variant="callout" />} />
        ))}
      </Group>
    )
  })
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.l }}>
      <Heading text={o.side === 'to' ? 'To' : 'From'} />
      {o.side === 'to' && SHAPES[d.kind].to === 'optional' && <Group><Row label="None" chevron={false} onPress={() => onPick(null)} trailing={check(o.id == null, c.ink)} /></Group>}
      {groups}
    </ScrollView>
  )
}
