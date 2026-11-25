// From Your Bank: what the banks brought that Tally wasn't sure of (pick a category, it's added), bank accounts it
// doesn't know yet, and what it added by itself this week, to look over or take back. Like Mail, a row swipes right
// to add it as shown and left to skip it.
import { useRef, useState } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import Animated, { FadeOut } from 'react-native-reanimated'
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError, type BankAsk, type BankRecent, type BankRow, type CatType } from '@/lib/api'
import { refreshBank, useBank, useBankInbox } from '@/lib/bank'
import { dayLabel } from '@/lib/dates'
import { deleteEntry } from '@/design/actions'
import { failure, success, thump } from '@/design/haptics'
import { useLedger } from '@/design/ledger'
import { SETTLE } from '@/design/motion'
import { amountLook, categoryLook, KIND_LOOK, wantsLogo } from '@/design/look'
import { space, usePalette } from '@/design/theme'
import { Button } from '@/design/ui/Button'
import { Empty, Section } from '@/design/ui/List'
import { Logo } from '@/design/ui/Logo'
import { Money } from '@/design/ui/Money'
import { Choice } from '@/design/ui/native/Choice'
import { notify } from '@/design/ui/Notice'
import { Press } from '@/design/ui/Press'
import { SF } from '@/design/ui/SF'
import { SheetHeader } from '@/design/ui/SheetHeader'
import { Txt } from '@/design/ui/Txt'

const LEAVE = SETTLE
const NOT_TRACKED = -1

function Waiting({ r }: { r: BankRow }) {
  const p = usePalette()
  const L = useLedger()
  const g = r.guess
  const out = r.amount > 0
  const [cat, setCat] = useState<number | null>(g?.category_id ?? null)
  const guessOther = g ? (g.from_id === r.account_id ? g.to_id : g.from_id) : null
  const [other, setOther] = useState<number | null>(guessOther)
  const [busy, setBusy] = useState(false)
  const c = cat !== null ? L.cat.get(cat) : undefined
  const look = categoryLook(c)
  // Money out: spending first, then moves; money in: income, moves, then refunds.
  const types: CatType[] = out ? ['Spending', 'Transfer', 'Loan', 'Saving'] : ['Money in', 'Transfer', 'Spending']
  const options = (L.b?.categories ?? []).filter((x) => x.active && types.includes(x.type))
    .sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type))
  const moving = c?.type === 'Transfer' || c?.type === 'Loan' || c?.type === 'Saving'
  const needsOther = c?.type === 'Transfer' || (moving && !out)
  const accounts: [number, string][] = (L.b?.accounts ?? []).filter((x) => x.active && x.id !== r.account_id).map((x) => [x.id, x.name])
  const name = g?.what || r.merchant || r.raw
  const ready = cat !== null && (!needsOther || other !== null)
  const sw = useRef<SwipeableMethods>(null)
  const skip = async () => {
    setBusy(true)
    try {
      await api.bank.ignore(r.id)
      success()
      await refreshBank()
      notify({ text: `Skipped ${name}`, symbol: 'eye.slash.fill', hue: 'gray', action: { label: 'Undo', run: async () => { await api.bank.reset(r.id); await refreshBank() } } })
    } catch {
      failure(); setBusy(false); sw.current?.close()
    }
  }
  const add = async () => {
    if (!ready) { failure(); sw.current?.close(); return }
    setBusy(true)
    const sides = moving ? (out ? { from_id: r.account_id, to_id: other } : { from_id: other, to_id: r.account_id }) : {}
    try {
      const same = cat === g?.category_id && (!moving || other === guessOther)
      const e = await api.bank.accept(r.id, same ? {} : { category_id: cat!, ...sides })
      success()
      await refreshBank()
      notify({ text: `Added ${e.what}`, symbol: 'checkmark.circle.fill', action: { label: 'Undo', run: async () => { await api.deleteTxn(e.id); await api.bank.reset(r.id); await refreshBank() } } })
    } catch (err) {
      failure(); setBusy(false); sw.current?.close()
      notify({ text: err instanceof ApiError ? err.errors.join(' ') : "Couldn't add it", symbol: 'exclamationmark.triangle.fill', hue: 'orange' })
    }
  }
  const amt = amountLook(out ? 'Spending' : 'Money in', out ? r.amount : -r.amount)
  return (
    <Animated.View exiting={FadeOut.duration(180)} layout={LEAVE}>
      <ReanimatedSwipeable ref={sw} friction={1.4} leftThreshold={90} rightThreshold={90} overshootLeft={false} overshootRight={false}
        onSwipeableWillOpen={() => thump()}
        onSwipeableOpen={(d) => { if (d === 'left') add(); else skip() }}
        renderLeftActions={() => <SwipeAction label="Add" symbol="checkmark" color={ready ? p.green : p.gray} align="flex-start" />}
        renderRightActions={() => <SwipeAction label="Skip" symbol="eye.slash.fill" color={p.gray} align="flex-end" />}>
      <View style={{ paddingHorizontal: space.l, paddingVertical: space.m, gap: space.m, backgroundColor: p.card }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <Logo name={wantsLogo(c?.type ?? 'Spending') ? (r.merchant || name) : undefined} symbol={look.symbol} color={c ? p[look.hue] : p.gray} size={42} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="body" numberOfLines={1}>{name}</Txt>
          <Txt v="subhead" tone="label2" numberOfLines={1}>{dayLabel(r.authorized_date ?? r.date, L.today)} · {L.acct.get(r.account_id)?.name ?? r.bank_account}</Txt>
        </View>
        <Money cents={amt.cents} plus={amt.plus} tone={amt.tone} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 54, gap: space.s }}>
        <View style={{ flex: 1, gap: space.xs, alignItems: 'flex-start' }}>
          <Choice options={options.map((x) => [x.id, x.name])} value={cat} onChange={setCat} none="Choose Category" />
          {moving && <Choice options={accounts} value={other} onChange={setOther} none="Choose Account" />}
        </View>
        <Press onPress={add} disabled={!ready || busy} accessibilityLabel={`Add ${name}`}
          style={{ height: 32, paddingHorizontal: 14, borderRadius: 16, justifyContent: 'center', backgroundColor: ready ? p.blue : p.fill3, opacity: busy ? 0.5 : 1 }}>
          <Txt v="subhead" weight="600" color={ready ? '#FFFFFF' : p.label3}>Add</Txt>
        </Press>
      </View>
      </View>
      </ReanimatedSwipeable>
    </Animated.View>
  )
}

/** What shows under a row as it's swiped: the action's color with its symbol and name at the edge. */
function SwipeAction({ label, symbol, color, align }: { label: string; symbol: 'checkmark' | 'eye.slash.fill'; color: string; align: 'flex-start' | 'flex-end' }) {
  return (
    <View style={{ flex: 1, backgroundColor: color, justifyContent: 'center', alignItems: align, paddingHorizontal: 28 }}>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <SF name={symbol} size={20} color="#FFFFFF" weight="semibold" />
        <Txt v="footnote" weight="600" color="#FFFFFF">{label}</Txt>
      </View>
    </View>
  )
}

function Ask({ a }: { a: BankAsk }) {
  const p = usePalette()
  const L = useLedger()
  const bank = useBank().data
  const taken = new Set((bank?.items ?? []).flatMap((i) => i.accounts.map((x) => x.tally_account_id)))
  const options: [number, string][] = [...(L.b?.accounts ?? []).filter((x) => x.active && a.kinds.includes(x.kind) && !taken.has(x.id)).map((x) => [x.id, x.name] as [number, string]),
    [NOT_TRACKED, 'Not Tracked']]
  const look = KIND_LOOK[a.kinds[0] ?? 'cash']
  return (
    <Animated.View exiting={FadeOut.duration(180)} layout={LEAVE} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m }}>
      <Logo symbol={look.symbol} color={p[look.hue]} size={36} />
      <View style={{ flex: 1 }}>
        <Txt v="body" numberOfLines={1}>{a.name}{a.mask ? ` ••${a.mask}` : ''}</Txt>
        <Txt v="subhead" tone="label2" numberOfLines={1}>{a.institution ?? 'Bank'}</Txt>
      </View>
      <Choice options={options} value={null} none="Which Account?" onChange={async (v) => {
        try { await api.bank.mapAccount(a.id, v === NOT_TRACKED ? null : v); success(); await refreshBank() } catch { failure() }
      }} />
    </Animated.View>
  )
}

function Added({ x }: { x: BankRecent }) {
  const p = usePalette()
  const L = useLedger()
  const c = L.cat.get(x.category_id)
  const look = categoryLook(c)
  const amt = amountLook(c?.type, x.amount)
  return (
    <Animated.View exiting={FadeOut.duration(180)} layout={LEAVE}>
      <ReanimatedSwipeable friction={1.6} rightThreshold={80} overshootRight={false}
        renderRightActions={() => (
          <Press feel="none" onPress={() => deleteEntry({ id: x.txn_id })} accessibilityLabel={`Remove ${x.what}`}
            style={{ width: 96, backgroundColor: p.red, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="subhead" weight="600" color="#FFFFFF">Remove</Txt>
          </Press>
        )}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: 10, backgroundColor: p.card }}>
          <Logo name={wantsLogo(c?.type) ? x.what : undefined} symbol={look.symbol} color={p[look.hue]} size={42} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="body" numberOfLines={1}>{x.what}</Txt>
            <Txt v="subhead" tone="label2" numberOfLines={1}>{c?.name} · {dayLabel(x.date, L.today)}</Txt>
          </View>
          <Money cents={amt.cents} plus={amt.plus} tone={amt.tone} />
        </View>
      </ReanimatedSwipeable>
    </Animated.View>
  )
}

export default function CheckIn() {
  const p = usePalette()
  const inbox = useBankInbox()
  const bank = useBank().data
  const recent = useQuery({ queryKey: ['bank', 'recent'], queryFn: () => api.bank.recent(7) })
  const [refreshing, setRefreshing] = useState(false)
  const rows = inbox.data ?? []
  const posted = rows.filter((r) => !r.pending)
  const pending = rows.length - posted.length
  const guessed = posted.filter((r) => r.guess?.category_id != null)
  const asks = bank?.ask ?? []
  const added = recent.data ?? []
  const [adding, setAdding] = useState(false)
  const addAll = async () => {
    setAdding(true)
    try {
      const made = await api.bank.acceptMany(guessed.map((r) => r.id))
      success(); await refreshBank()
      notify({ text: `Added ${made.length}`, symbol: 'checkmark.circle.fill', action: { label: 'Undo', run: async () => { await api.bulk({ ids: made.map((t) => t.id), action: 'delete' }); await refreshBank() } } })
    } catch { failure() } finally { setAdding(false) }
  }
  const refresh = async () => { setRefreshing(true); try { await api.bank.sync(0).catch(() => {}); await refreshBank() } finally { setRefreshing(false) } }
  const done = inbox.data && !posted.length && !asks.length

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60, gap: space.xxl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <SheetHeader title="From Your Bank" subtitle={posted.length ? `${posted.length} to review` : undefined} />
        <View style={{ paddingHorizontal: space.l, gap: space.xxl }}>
          {done && <Empty symbol="checkmark.circle" title="You're All Caught Up" body="Everything from your banks is in Tally." />}
          {posted.length > 0 && (
            <Section title="To Review" compact inset={70} footer={`Swipe right to add, left to skip.${pending ? ` ${pending} pending at the bank.` : ''}`}>
              {posted.map((r) => <Waiting key={r.id} r={r} />)}
            </Section>
          )}
          {guessed.length > 1 && <Button label="Add All" kind="tinted" onPress={addAll} busy={adding} />}
          {asks.length > 0 && (
            <Section title="New Accounts" compact inset={64} footer="Choose where each account belongs.">
              {asks.map((a) => <Ask key={a.id} a={a} />)}
            </Section>
          )}
          {added.length > 0 && (
            <Section title="Added Automatically" compact inset={70} footer="This week. Swipe left to remove one.">
              {added.slice(0, 30).map((x) => <Added key={x.id} x={x} />)}
            </Section>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
