// Add or edit a transaction. The amount is typed on the pad and grows on screen digit by digit; a name brings its
// usual category and account with it; the date sits under the amount. One button saves; offline, it waits on the
// phone and goes to Tally later.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError, locked, unreachable, type Txn, type TxnInput } from '@/lib/api'
import { refreshBank } from '@/lib/bank'
import { cachedTxn, useTransactions } from '@/lib/data'
import { enqueue, newClientId, send } from '@/lib/outbox'
import { close, useBusy, useCloseHere } from '@/design/busy'
import { accountChoices, addedText, categoryChoices, entryOf, fromKinds, loadedAmount, modeOf, needsTo, offered, ready as isReady,
  toKinds, typedBase, TYPES, undoInput, type Mode } from '@/design/compose'
import { failure, success, tick, warning } from '@/design/haptics'
import { accountOf, useLedger } from '@/design/ledger'
import { categoryLook, KIND_LOOK, wantsLogo } from '@/design/look'
import { radius, space, usePalette } from '@/design/theme'
import { Button } from '@/design/ui/Button'
import { Keypad, typedCents, typedText, typeKey } from '@/design/ui/Keypad'
import { Card, Empty, Row, Tile } from '@/design/ui/List'
import { Logo } from '@/design/ui/Logo'
import { NumericText } from '@/design/ui/Money'
import { Choice } from '@/design/ui/native/Choice'
import { DateChoice } from '@/design/ui/native/DateChoice'
import { Segmented } from '@/design/ui/native/Segmented'
import { notify } from '@/design/ui/Notice'
import { Press } from '@/design/ui/Press'
import { SF } from '@/design/ui/SF'
import { Txt } from '@/design/ui/Txt'

const NONE = -1

export default function Add() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const editing = id ? Number(id) : null
  const old = useQuery({ queryKey: ['transactions', 'one', editing], queryFn: () => api.transaction(editing!), enabled: editing !== null,
    initialData: () => (editing !== null ? cachedTxn(editing) : undefined) })
  const L = useLedger()
  if (editing !== null && (!old.data || !L.b)) {
    const gone = old.error instanceof ApiError && old.error.status === 404
    if (old.isError || (!L.b && L.q.isError)) return <Missing gone={gone} />
    return <Missing loading />
  }
  return <Composer t={editing !== null ? old.data : undefined} />
}

/** An entry that can't be edited: still loading, deleted, or Tally out of reach. */
function Missing({ loading, gone }: { loading?: boolean; gone?: boolean }) {
  const p = usePalette()
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Header title="Edit Transaction" />
      {loading ? <ActivityIndicator style={{ marginTop: 80 }} color={p.label2} />
        : <Empty symbol={gone ? 'trash' : 'icloud.slash'} title={gone ? 'Transaction Deleted' : 'Can’t Load Transaction'}
            body={gone ? 'It’s no longer in Tally.' : 'Tally can’t be reached right now.'} />}
    </View>
  )
}

function Header({ title }: { title: string }) {
  const p = usePalette()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.l, paddingTop: space.l, height: 56 }}>
      <Press onPress={close} accessibilityLabel="Cancel" hitSlop={10}
        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: p.fill3, alignItems: 'center', justifyContent: 'center' }}>
        <SF name="xmark" size={15} color={p.label2} weight="bold" />
      </Press>
      <Txt v="headline">{title}</Txt>
      <View style={{ width: 36 }} />
    </View>
  )
}

/** `value`, once it has stopped changing for `ms`. */
function useSettled<T>(value: T, ms: number): [T, (v: T) => void] {
  const [settled, setSettled] = useState(value)
  useEffect(() => { const id = setTimeout(() => setSettled(value), ms); return () => clearTimeout(id) }, [value, ms])
  return [settled, setSettled]
}

/** The form itself, starting from `t` when editing it. */
function Composer({ t }: { t?: Txn }) {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const L = useLedger()
  const recent = useTransactions({ sort: 'date', dir: 'desc', limit: 300, end: L.today })
  const type0 = t ? L.cat.get(t.category_id)?.type : undefined
  const [mode, setMode] = useState<Mode>(modeOf(type0))
  const [amount, setAmount] = useState(t ? loadedAmount(t.amount) : '')
  const [fresh, setFresh] = useState(!!t) // a loaded amount: the first key replaces it
  const [neg, setNeg] = useState(!!t && t.amount < 0)
  const [what, setWhat] = useState(t?.what ?? '')
  const [logoName, setLogoName] = useSettled(what.trim(), 450) // the logo looks up a name once typing pauses
  const [cat, setCat] = useState<number | null>(t?.category_id ?? null)
  const [fromPick, setFrom] = useState<number | null>(t ? t.from_id : null)
  const [toPick, setTo] = useState<number | null>(t ? t.to_id : null)
  const [date, setDate] = useState(t?.date ?? L.today)
  const [naming, setNaming] = useState(false)
  const saving = useBusy()
  const closeHere = useCloseHere()
  const cid = useRef(newClientId()) // one per composer: a retried save after a lost answer can't add it twice
  const done = useRef(false)
  const shake = useSharedValue(0)
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }))

  const all = L.b?.accounts ?? []
  const c = cat !== null ? L.cat.get(cat) : undefined
  const type = c?.type
  const refund = mode === 'out' && neg
  const cats = useMemo(() => categoryChoices(L.b?.categories ?? [], TYPES[mode], cat), [L.b, mode, cat])
  const history = useMemo(() => (recent.data?.items ?? []).filter((x) => modeOf(L.cat.get(x.category_id)?.type) === mode && x.what), [recent.data, L.cat, mode])

  // A new entry starts on the account you used last for this kind of entry (while it's still offered), until you pick one.
  const last = history[0]
  const lastAcct = last ? accountOf(last, L.cat.get(last.category_id)?.type) : null
  const usualList = accountChoices(all, mode === 'in' ? toKinds('in') : fromKinds(mode), null)
  const usual = t ? null : offered(usualList, lastAcct) ? lastAcct : usualList[0]?.id ?? null
  const from = fromPick ?? (mode !== 'in' ? usual : null)
  const to = toPick ?? (mode === 'in' ? usual : null)
  const fromList = accountChoices(all, fromKinds(mode), from, mode === 'move' ? to : undefined)
  const toList = accountChoices(all, toKinds(mode, c), to, mode === 'move' ? from : undefined)
  const toOptional = mode === 'move' && type !== undefined && !needsTo(mode, type)

  const suggestions = useMemo(() => {
    const seen = new Map<string, Txn>()
    for (const x of history) { const k = x.what.toLowerCase(); if (!seen.has(k)) seen.set(k, x) }
    const found = [...seen.values()]
    const needle = what.trim().toLowerCase()
    return (needle ? found.filter((x) => x.what.toLowerCase().startsWith(needle) && x.what.toLowerCase() !== needle) : found).slice(0, 8)
  }, [history, what])

  /** A category, dropping a To that doesn't fit it (a card left over from Credit Card Payment on a Loan Payment). */
  const chooseCat = (id: number) => {
    setCat(id)
    if (toPick !== null && !offered(accountChoices(all, toKinds(mode, L.cat.get(id)), null), toPick)) setTo(null)
  }
  const pick = (x: Txn) => {
    tick()
    setWhat(x.what); setLogoName(x.what)
    const xc = L.cat.get(x.category_id)
    if (xc?.active) setCat(x.category_id)
    if (mode === 'in') { if (offered(accountChoices(all, toKinds('in'), null), x.to_id)) setTo(x.to_id) }
    else if (offered(accountChoices(all, fromKinds(mode), null), x.from_id)) setFrom(x.from_id)
    if (mode === 'move') setTo(offered(accountChoices(all, toKinds('move', xc?.active ? xc : c), null), x.to_id) ? x.to_id : null)
  }
  const press = (k: string) => {
    const next = typeKey(typedBase(amount, k, fresh), k)
    if (next === null) { warning(); shake.set(withSequence(...[-9, 9, -6, 6, -3, 0].map((x) => withTiming(x, { duration: 55 })))); return } // the passcode shake
    setAmount(next); setFresh(false)
  }
  const switchMode = (m: Mode) => { setMode(m); setCat(null); setNeg(false); setFrom(null); setTo(null) }

  const cents = typedCents(amount)
  const ok = isReady({ mode, cents, cat, type, from, to })
  const save = () => saving.run(async () => {
    if (done.current) return
    if (!ok) { warning(); return }
    const name = what.trim() || c?.name || 'Entry'
    const input: TxnInput = { date, what: name, category_id: cat!, ...entryOf({ mode, cents, neg, from, to }), note: t?.note, tags: t?.tags }
    try {
      if (t) {
        await api.updateTxn(t.id, input)
        done.current = true
        success(); closeHere()
        const before = undoInput(t)
        notify({ text: 'Saved', symbol: 'checkmark.circle.fill', action: { label: 'Undo', run: async () => { await api.updateTxn(t.id, before); await refreshBank() } } })
      } else {
        const lines = [input]
        try {
          const r = await send(lines, cid.current)
          const made = Array.isArray(r) ? r : [r]
          done.current = true
          success(); closeHere()
          notify({ text: addedText(name, refund), symbol: 'checkmark.circle.fill', action: { label: 'Undo', run: async () => { await api.deleteTxn(made[0].id); await refreshBank() } } })
        } catch (e) {
          if (!unreachable(e) && !locked(e)) throw e
          enqueue({ cid: cid.current, lines, label: name })
          done.current = true
          success(); closeHere()
          notify(locked(e)
            ? { text: 'Saved on your phone. Check the token in Settings.', symbol: 'key.fill', hue: 'orange' }
            : { text: 'Saved on your phone', symbol: 'icloud.slash.fill', hue: 'orange' })
        }
      }
      await refreshBank()
    } catch (e) {
      failure()
      notify({ text: e instanceof ApiError ? e.errors.join(' ') : "Couldn't save it", symbol: 'exclamationmark.triangle.fill', hue: 'orange' })
    }
  })

  const look = categoryLook(c ?? (mode === 'in' ? { name: '', type: 'Money in' } : mode === 'move' ? { name: '', type: 'Transfer' } : undefined))
  const opts = (list: { id: number; name: string }[]): [number, string][] => list.map((a) => [a.id, a.name])
  const acctLeading = (aid: number | null) => {
    const a = aid !== null ? L.acct.get(aid) : undefined
    return a ? <Logo account={a.id} symbol={KIND_LOOK[a.kind].symbol} color={p[KIND_LOOK[a.kind].hue]} size={30} /> : <Tile symbol="building.columns.fill" color={p.gray} size={30} />
  }
  const typed = typedText(amount)

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Header title={t ? 'Edit Transaction' : 'New Transaction'} />

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.l, gap: space.l, paddingBottom: space.l }}>
        <View style={{ marginTop: space.s }}>
          <Segmented options={[['out', 'Expense'], ['in', 'Income'], ['move', 'Transfer']]} value={mode} onChange={switchMode} />
        </View>

        <Animated.View style={[{ alignItems: 'center', paddingVertical: space.m, gap: space.s }, shakeStyle]}>
          <View style={{ minHeight: 76, justifyContent: 'center' }}>
            {/* A refund reads like it does in the lists: green with a +. A negative correction keeps its −. */}
            <NumericText typing text={refund ? '+' + typed : neg ? '−' + typed : typed} down={false}
              style={{ fontSize: amount.length > 7 ? 52 : 64, lineHeight: 76, fontWeight: '600', fontFamily: 'ui-rounded', letterSpacing: -1,
                color: amount ? (refund ? p.tint : p.label) : p.label3, fontVariant: ['tabular-nums'] }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
            <DateChoice value={date} onChange={(d) => { tick(); setDate(d) }} min={L.b?.start} />
            {mode === 'out' && (
              <Press onPress={() => setNeg((r) => !r)} accessibilityLabel="Refund" accessibilityState={{ selected: refund }}
                style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, justifyContent: 'center', backgroundColor: refund ? p.tint : p.fill3 }}>
                <Txt v="subhead" weight="600" color={refund ? '#FFFFFF' : p.label2}>Refund</Txt>
              </Press>
            )}
          </View>
        </Animated.View>

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, minHeight: 56 }}>
            <Logo name={wantsLogo(type ?? (mode === 'in' ? 'Money in' : mode === 'out' ? 'Spending' : 'Transfer')) ? logoName : undefined}
              symbol={look.symbol} color={p[look.hue]} size={30} />
            <TextInput value={what} onChangeText={setWhat} placeholder="Name" placeholderTextColor={p.label3}
              onFocus={() => setNaming(true)} onBlur={() => { setNaming(false); setLogoName(what.trim()) }} returnKeyType="done" autoCorrect={false}
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
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, maxWidth: 200, paddingLeft: 4, paddingRight: 12, borderRadius: radius.control, backgroundColor: p.fill3 }}>
                      <Logo name={wantsLogo(L.cat.get(x.category_id)?.type) ? x.what : undefined} symbol={xl.symbol} color={p[xl.hue]} size={26} />
                      <Txt v="subhead" weight="500" numberOfLines={1} style={{ flexShrink: 1 }}>{x.what}</Txt>
                    </Press>
                  )
                })}
              </ScrollView>
            </Animated.View>
          )}
          <View style={{ height: 0.5, backgroundColor: p.separator, marginLeft: 62 }} />
          <Row leading={<Tile symbol={look.symbol} color={c ? p[look.hue] : p.gray} size={30} />} title="Category"
            trailing={<Choice options={opts(cats)} value={cat} onChange={chooseCat} none="Choose" />} />
          <View style={{ height: 0.5, backgroundColor: p.separator, marginLeft: 62 }} />
          {mode === 'in' ? (
            <Row leading={acctLeading(to)} title="Deposited To" trailing={<Choice options={opts(toList)} value={to} onChange={setTo} />} />
          ) : (
            <Row leading={acctLeading(from)} title={mode === 'move' ? 'From' : 'Paid With'} trailing={<Choice options={opts(fromList)} value={from} onChange={setFrom} />} />
          )}
          {mode === 'move' && (
            <>
              <View style={{ height: 0.5, backgroundColor: p.separator, marginLeft: 62 }} />
              <Row leading={acctLeading(to)} title="To"
                trailing={<Choice options={[...opts(toList), ...(toOptional && to !== null ? [[NONE, 'None'] as [number, string]] : [])]} value={to}
                  onChange={(v) => setTo(v === NONE ? null : v)} none={toOptional ? 'None' : 'Choose'} />} />
            </>
          )}
        </Card>
      </ScrollView>

      {!naming && (
        <Animated.View entering={FadeIn.duration(180)} style={{ paddingHorizontal: space.l, paddingBottom: Math.max(insets.bottom, space.l), gap: space.s }}>
          <Keypad onKey={press} />
          <Button label={t ? 'Save' : 'Add Transaction'} onPress={save} disabled={!ok} busy={saving.on} />
        </Animated.View>
      )}
    </View>
  )
}
