// Add or edit a transaction. The amount is typed on the pad and grows on screen digit by digit; a name brings its
// usual category and account with it; the date sits under the amount. One button saves; offline, it waits on the
// phone and goes to Tally later.
import { useMemo, useState } from 'react'
import { ScrollView, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, ZoomIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError, type CatType, type Kind, type Txn, type TxnInput } from '@/lib/api'
import { cachedTxn, invalidateAll, useTransactions } from '@/lib/data'
import { sendOrQueue } from '@/lib/outbox'
import { failure, success, tick, warning } from '@/next/haptics'
import { accountOf, useLedger } from '@/next/ledger'
import { categoryLook, KIND_LOOK, wantsLogo } from '@/next/look'
import { radius, space, springs, usePalette } from '@/next/theme'
import { Button } from '@/next/ui/Button'
import { Keypad, typedCents, typedText, typeKey } from '@/next/ui/Keypad'
import { Card, Row, Tile } from '@/next/ui/List'
import { Logo } from '@/next/ui/Logo'
import { Choice } from '@/next/ui/native/Choice'
import { DateChoice } from '@/next/ui/native/DateChoice'
import { Segmented } from '@/next/ui/native/Segmented'
import { notify } from '@/next/ui/Notice'
import { Press } from '@/next/ui/Press'
import { SF } from '@/next/ui/SF'
import { Txt } from '@/next/ui/Txt'

type Mode = 'out' | 'in' | 'move'
const TYPES: Record<Mode, CatType[]> = { out: ['Spending'], in: ['Money in'], move: ['Transfer', 'Loan', 'Saving'] }
const KINDS: Record<Mode, Kind[]> = { out: ['cash', 'card'], in: ['cash', 'card'], move: ['cash', 'card', 'investment', 'loan'] }
const modeOf = (t: CatType | undefined): Mode => (t === 'Money in' ? 'in' : t === 'Spending' || !t ? 'out' : 'move')

export default function Add() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const editing = id ? Number(id) : null
  const old = useQuery({ queryKey: ['transactions', 'one', editing], queryFn: () => api.transaction(editing!), enabled: editing !== null,
    initialData: () => (editing !== null ? cachedTxn(editing) : undefined) })
  const L = useLedger()
  if (editing !== null && (!old.data || !L.b)) return <View style={{ flex: 1 }} />
  return <Composer t={editing !== null ? old.data : undefined} />
}

/** The form itself, starting from `t` when editing it. */
function Composer({ t }: { t?: Txn }) {
  const editing = t?.id ?? null
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const L = useLedger()
  const recent = useTransactions({ sort: 'date', dir: 'desc', limit: 300, end: L.today })
  const type0 = t ? L.cat.get(t.category_id)?.type : undefined
  const [mode, setMode] = useState<Mode>(modeOf(type0))
  const [amount, setAmount] = useState(t ? String(Math.abs(t.amount) / 100) : '')
  const [refund, setRefund] = useState(type0 === 'Spending' && !!t && t.amount < 0)
  const [what, setWhat] = useState(t?.what ?? '')
  const [cat, setCat] = useState<number | null>(t?.category_id ?? null)
  const [fromPick, setFrom] = useState<number | null>(t ? t.from_id : null)
  const [toPick, setTo] = useState<number | null>(t ? t.to_id : null)
  const [date, setDate] = useState(t?.date ?? L.today)
  const [naming, setNaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const shake = useSharedValue(0)
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }))

  const cats = useMemo(() => (L.b?.categories ?? []).filter((c) => c.active && TYPES[mode].includes(c.type)), [L.b, mode])
  const accounts = useMemo(() => (L.b?.accounts ?? []).filter((a) => a.active && KINDS[mode].includes(a.kind)), [L.b, mode])
  const history = useMemo(() => (recent.data?.items ?? []).filter((x) => modeOf(L.cat.get(x.category_id)?.type) === mode && x.what), [recent.data, L.cat, mode])

  // A new entry starts on the account you used last for this kind of entry, until you pick one.
  const last = history[0]
  const usual = editing !== null ? null : (last ? accountOf(last, L.cat.get(last.category_id)?.type) : accounts[0]?.id) ?? null
  const from = fromPick ?? (mode !== 'in' ? usual : null)
  const to = toPick ?? (mode === 'in' ? usual : null)

  const suggestions = useMemo(() => {
    const seen = new Map<string, Txn>()
    for (const x of history) { const k = x.what.toLowerCase(); if (!seen.has(k)) seen.set(k, x) }
    const all = [...seen.values()]
    const needle = what.trim().toLowerCase()
    return (needle ? all.filter((x) => x.what.toLowerCase().startsWith(needle) && x.what.toLowerCase() !== needle) : all).slice(0, 8)
  }, [history, what])

  const pick = (x: Txn) => {
    tick()
    setWhat(x.what); setCat(x.category_id)
    if (mode === 'in') setTo(x.to_id); else setFrom(x.from_id)
    if (mode === 'move') setTo(x.to_id)
  }
  const press = (k: string) => {
    const next = typeKey(amount, k)
    if (next === null) { warning(); shake.set(withSequence(withTiming(-8, { duration: 50 }), withTiming(8, { duration: 50 }), withSpring(0, springs.bouncy))); return }
    setAmount(next)
  }
  const switchMode = (m: Mode) => { setMode(m); setCat(null); setRefund(false); setFrom(null); setTo(null) }

  const cents = typedCents(amount)
  const ready = cents > 0 && cat !== null && (mode === 'out' ? from !== null : mode === 'in' ? to !== null : from !== null && to !== null && from !== to)
  const save = async () => {
    if (!ready) { warning(); return }
    setBusy(true)
    const name = what.trim() || L.cat.get(cat!)?.name || 'Entry'
    const input: TxnInput = { date, what: name, category_id: cat!, amount: refund ? -cents : cents,
      from_id: mode === 'in' ? null : from, to_id: mode === 'out' ? null : to, note: t?.note, tags: t?.tags }
    try {
      if (editing !== null) {
        await api.updateTxn(editing, input)
        success(); router.back()
        notify({ text: 'Saved', symbol: 'checkmark.circle.fill' })
      } else {
        const made = await sendOrQueue([input], name)
        success(); router.back()
        notify(made
          ? { text: `Added ${name}`, symbol: 'checkmark.circle.fill', action: { label: 'Undo', run: async () => { await api.deleteTxn(made[0].id); await invalidateAll() } } }
          : { text: 'Saved on your phone', symbol: 'icloud.slash.fill', hue: 'orange' })
      }
      await invalidateAll()
    } catch (e) {
      failure(); setBusy(false)
      notify({ text: e instanceof ApiError ? e.errors.join(' ') : "Couldn't save it", symbol: 'exclamationmark.triangle.fill', hue: 'orange' })
    }
  }

  const c = cat !== null ? L.cat.get(cat) : undefined
  const look = categoryLook(c ?? (mode === 'in' ? { name: '', type: 'Money in' } : mode === 'move' ? { name: '', type: 'Transfer' } : undefined))
  const acctOptions = (skip?: number | null): [number, string][] => accounts.filter((a) => a.id !== skip).map((a) => [a.id, a.name])
  const acctLeading = (aid: number | null) => {
    const a = aid !== null ? L.acct.get(aid) : undefined
    return a ? <Logo account={a.id} symbol={KIND_LOOK[a.kind].symbol} color={p[KIND_LOOK[a.kind].hue]} size={30} /> : <Tile symbol="building.columns.fill" color={p.gray} size={30} />
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.l, paddingTop: space.l, height: 56 }}>
        <Press onPress={() => router.back()} accessibilityLabel="Cancel" hitSlop={10}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: p.fill3, alignItems: 'center', justifyContent: 'center' }}>
          <SF name="xmark" size={15} color={p.label2} weight="bold" />
        </Press>
        <Txt v="headline">{editing !== null ? 'Edit Transaction' : 'New Transaction'}</Txt>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.l, gap: space.l, paddingBottom: space.l }}>
        <View style={{ marginTop: space.s }}>
          <Segmented options={[['out', 'Expense'], ['in', 'Income'], ['move', 'Transfer']]} value={mode} onChange={switchMode} />
        </View>

        <Animated.View style={[{ alignItems: 'center', paddingVertical: space.m, gap: space.s }, shakeStyle]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', minHeight: 76 }}>
            {(refund ? '−' + typedText(amount) : typedText(amount)).split('').map((ch, i) => (
              <Animated.Text key={`${i}${ch}`} entering={i === 0 ? undefined : ZoomIn.springify().damping(14).stiffness(260)} exiting={FadeOut.duration(80)}
                layout={LinearTransition.springify().damping(18).stiffness(240)}
                style={{ fontSize: amount.length > 7 ? 52 : 64, lineHeight: 76, fontWeight: '600', fontFamily: 'ui-rounded', letterSpacing: -1,
                  color: amount ? (refund ? p.green : p.label) : p.label3, fontVariant: ['tabular-nums'] }}>{ch}</Animated.Text>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
            <DateChoice value={date} onChange={(d) => { tick(); setDate(d) }} min={L.b?.start} />
            {mode === 'out' && (
              <Press onPress={() => setRefund((r) => !r)} accessibilityLabel="Refund"
                style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, justifyContent: 'center', backgroundColor: refund ? p.green : p.fill3 }}>
                <Txt v="subhead" weight="600" color={refund ? '#FFFFFF' : p.label2}>Refund</Txt>
              </Press>
            )}
          </View>
        </Animated.View>

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, minHeight: 56 }}>
            <Logo name={wantsLogo(c?.type ?? (mode === 'in' ? 'Money in' : mode === 'out' ? 'Spending' : 'Transfer')) ? what.trim() : undefined}
              symbol={look.symbol} color={p[look.hue]} size={30} />
            <TextInput value={what} onChangeText={setWhat} placeholder={mode === 'move' ? 'Description' : 'Where or what?'} placeholderTextColor={p.label3}
              onFocus={() => setNaming(true)} onBlur={() => setNaming(false)} returnKeyType="done" autoCorrect={false}
              style={{ flex: 1, fontSize: 17, color: p.label, paddingVertical: space.m }} />
          </View>
          {suggestions.length > 0 && (naming || !what) && (
            <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l, paddingBottom: space.m }}>
                {suggestions.map((x) => {
                  const xl = categoryLook(L.cat.get(x.category_id))
                  return (
                    <Press key={x.id} onPress={() => pick(x)} haptic={false}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingLeft: 4, paddingRight: 12, borderRadius: radius.control, backgroundColor: p.fill3 }}>
                      <Logo name={wantsLogo(L.cat.get(x.category_id)?.type) ? x.what : undefined} symbol={xl.symbol} color={p[xl.hue]} size={26} />
                      <Txt v="subhead" weight="500" numberOfLines={1}>{x.what}</Txt>
                    </Press>
                  )
                })}
              </ScrollView>
            </Animated.View>
          )}
          <View style={{ height: 0.5, backgroundColor: p.separator, marginLeft: 62 }} />
          <Row leading={<Tile symbol={look.symbol} color={c ? p[look.hue] : p.gray} size={30} />} title="Category"
            trailing={<Choice options={cats.map((x) => [x.id, x.name])} value={cat} onChange={setCat} none="Choose" />} />
          <View style={{ height: 0.5, backgroundColor: p.separator, marginLeft: 62 }} />
          {mode === 'in' ? (
            <Row leading={acctLeading(to)} title="Deposited To" trailing={<Choice options={acctOptions()} value={to} onChange={setTo} />} />
          ) : (
            <Row leading={acctLeading(from)} title={mode === 'move' ? 'From' : 'Paid With'} trailing={<Choice options={acctOptions(mode === 'move' ? to : undefined)} value={from} onChange={setFrom} />} />
          )}
          {mode === 'move' && (
            <>
              <View style={{ height: 0.5, backgroundColor: p.separator, marginLeft: 62 }} />
              <Row leading={acctLeading(to)} title="To" trailing={<Choice options={acctOptions(from)} value={to} onChange={setTo} />} />
            </>
          )}
        </Card>
      </ScrollView>

      {!naming && (
        <Animated.View entering={FadeIn.duration(180)} style={{ paddingHorizontal: space.l, paddingBottom: Math.max(insets.bottom, space.l), gap: space.s }}>
          <Keypad onKey={press} />
          <Button label={editing !== null ? 'Save' : 'Add Transaction'} onPress={save} disabled={!ready} busy={busy} />
        </Animated.View>
      )}
    </View>
  )
}
