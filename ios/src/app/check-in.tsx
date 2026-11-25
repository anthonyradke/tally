// From Your Bank: what the banks brought that Tally wasn't sure of (pick a category, it's added), bank accounts it
// doesn't know yet, and what it added by itself this week, to look over or take back. Like Mail, a row swipes right
// to add it as shown and left to skip it.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import Animated, { FadeOut } from 'react-native-reanimated'
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError, type BankAsk, type BankRecent, type BankRow, type CatType, type Txn } from '@/lib/api'
import { newestId, refreshBank, useBank, useBankInbox } from '@/lib/bank'
import { dayLabel, todayISO } from '@/lib/dates'
import { useServer } from '@/lib/server'
import { useBusy } from '@/design/busy'
import { addAllPlan, already, rowPlan, saveSeenFor, why, type RowPick } from '@/design/checkin'
import { accountChoices, categoryChoices, fromKinds, offered, toKinds } from '@/design/compose'
import { failure, success, thump, warning } from '@/design/haptics'
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
const oops = { symbol: 'exclamationmark.triangle.fill', hue: 'orange' } as const

function Waiting({ r, pick, onPick }: { r: BankRow; pick: RowPick | undefined; onPick: (p: RowPick) => void }) {
  const p = usePalette()
  const L = useLedger()
  const plan = rowPlan(r, pick, (id) => L.cat.get(id))
  const { cat, other, out, moving, ready } = plan
  const busy = useBusy()
  const c = cat !== null ? L.cat.get(cat) : undefined
  const look = categoryLook(c)
  // Money out: spending first, then moves; money in: income, moves, then refunds. A hidden category Tally guessed
  // stays in the list, so the picker shows where it would go.
  const types: CatType[] = out ? ['Spending', 'Transfer', 'Loan', 'Saving'] : ['Money in', 'Transfer', 'Spending']
  const options = categoryChoices(L.b?.categories ?? [], types, cat).sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type))
  // The other side of a move: where money out went (by the category, like the composer), or where money in came from.
  const sideKinds = (cc = c) => (out ? toKinds('move', cc) : fromKinds('move'))
  const accounts = accountChoices(L.b?.accounts ?? [], sideKinds(), other, r.account_id)
  const name = r.guess?.what || r.merchant || r.raw
  const sw = useRef<SwipeableMethods>(null)
  const setCat = (id: number) => {
    const keep = other !== null && offered(accountChoices(L.b?.accounts ?? [], sideKinds(L.cat.get(id)), null, r.account_id), other)
    onPick({ cat: id, other: keep ? other : null })
  }
  const skip = () => busy.run(async () => {
    try {
      await api.bank.ignore(r.id)
      success()
      await refreshBank()
      notify({ text: `Skipped ${name}`, symbol: 'eye.slash.fill', hue: 'gray', action: { label: 'Undo', run: async () => { await api.bank.reset(r.id); await refreshBank() } } })
    } catch (e) {
      sw.current?.close()
      if (already(e)) { await refreshBank(); return }
      failure()
      notify({ text: why(e, "Couldn't skip it"), ...oops })
    }
  })
  const add = () => busy.run(async () => {
    if (!ready) { warning(); sw.current?.close(); return }
    try {
      const e = await api.bank.accept(r.id, plan.body)
      success()
      await refreshBank()
      notify({ text: `Added ${e.what}`, symbol: 'checkmark.circle.fill', action: { label: 'Undo', run: async () => { await api.deleteTxn(e.id); await api.bank.reset(r.id); await refreshBank() } } })
    } catch (err) {
      sw.current?.close()
      if (already(err)) { await refreshBank(); return } // a second tap, or the other side of a transfer got there first
      failure()
      notify({ text: why(err, "Couldn't add it"), ...oops })
    }
  })
  const amt = amountLook(out ? 'Spending' : 'Money in', out ? r.amount : -r.amount)
  return (
    <Animated.View exiting={FadeOut.duration(180)} layout={LEAVE}>
      {/* gesture-handler reports the direction the row moved: dragged right shows the Add panel on the left. */}
      <ReanimatedSwipeable ref={sw} friction={1.4} leftThreshold={90} rightThreshold={90} overshootLeft={false} overshootRight={false}
        onSwipeableWillOpen={() => thump()}
        onSwipeableOpen={(d) => { if (d === 'right') add(); else skip() }}
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
          {moving && <Choice options={accounts.map((x) => [x.id, x.name])} value={other} onChange={(v) => onPick({ cat, other: v })} none="Choose Account" />}
        </View>
        <Press onPress={add} disabled={!ready || busy.on} accessibilityLabel={`Add ${name}`}
          style={{ height: 32, minWidth: 58, paddingHorizontal: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ready ? p.tint : p.fill3 }}>
          {busy.on ? <ActivityIndicator color={ready ? '#FFFFFF' : p.label3} size="small" /> : <Txt v="subhead" weight="600" color={ready ? '#FFFFFF' : p.label3}>Add</Txt>}
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
  const busy = useBusy()
  const taken = new Set((bank?.items ?? []).flatMap((i) => i.accounts.map((x) => x.tally_account_id)))
  const options: [number, string][] = [...(L.b?.accounts ?? []).filter((x) => x.active && a.kinds.includes(x.kind) && !taken.has(x.id)).map((x) => [x.id, x.name] as [number, string]),
    [NOT_TRACKED, 'Not Tracked']]
  const look = KIND_LOOK[a.kinds[0] ?? 'cash']
  const place = (v: number) => busy.run(async () => {
    try {
      await api.bank.mapAccount(a.id, v === NOT_TRACKED ? null : v)
      success()
      await refreshBank()
      // There's no taking back "not tracked" from the check-in (the server stops asking); Settings › Banks can still
      // make it one of Tally's accounts.
      if (v === NOT_TRACKED) notify({ text: `${a.name} Not Tracked`, symbol: 'eye.slash.fill', hue: 'gray', action: { label: 'Change', run: () => router.push('/settings/banks') } })
    } catch (e) {
      failure()
      notify({ text: why(e, "Couldn't place it"), ...oops })
    }
  })
  return (
    <Animated.View exiting={FadeOut.duration(180)} layout={LEAVE} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m }}>
      <Logo symbol={look.symbol} color={p[look.hue]} size={36} />
      <View style={{ flex: 1 }}>
        <Txt v="body" numberOfLines={1}>{a.name}{a.mask ? ` ••${a.mask}` : ''}</Txt>
        <Txt v="subhead" tone="label2" numberOfLines={1}>{a.institution ?? 'Bank'}</Txt>
      </View>
      {busy.on ? <ActivityIndicator color={p.label2} /> : <Choice options={options} value={null} none="Which Account?" onChange={place} />}
    </Animated.View>
  )
}

function Added({ x }: { x: BankRecent }) {
  const p = usePalette()
  const L = useLedger()
  const busy = useBusy()
  const c = L.cat.get(x.category_id)
  const look = categoryLook(c)
  const amt = amountLook(c?.type, x.amount)
  const remove = () => busy.run(async () => {
    try {
      const row = await api.deleteTxn(x.txn_id)
      warning()
      await refreshBank()
      notify({ text: `Removed ${x.what}`, symbol: 'trash.fill', hue: 'red', action: { label: 'Undo', run: async () => {
        await api.restore([row])
        // Removing it marked the bank row as taken back; tie it to the entry again so it isn't asked about or added
        // twice. (It comes back as paired by hand, so it no longer lists under Added Automatically.)
        await api.bank.reset(x.id).catch(() => {})
        await api.bank.pair(x.id, row.id).catch(() => {}) // 409: the next sync paired it already
        await refreshBank()
        success()
      } } })
    } catch (e) {
      if (already(e)) { await refreshBank(); return }
      failure()
      notify({ text: why(e, "Couldn't remove it"), ...oops })
    }
  })
  return (
    <Animated.View exiting={FadeOut.duration(180)} layout={LEAVE}>
      <ReanimatedSwipeable friction={1.6} rightThreshold={80} overshootRight={false}
        renderRightActions={() => (
          <Press feel="none" onPress={remove} disabled={busy.on} accessibilityLabel={`Remove ${x.what}`}
            style={{ width: 96, backgroundColor: p.red, alignItems: 'center', justifyContent: 'center' }}>
            {busy.on ? <ActivityIndicator color="#FFFFFF" /> : <Txt v="subhead" weight="600" color="#FFFFFF">Remove</Txt>}
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
  const L = useLedger()
  const server = useServer((s) => s.url)
  const inbox = useBankInbox()
  const bankQ = useBank()
  const bank = bankQ.data
  const recent = useQuery({ queryKey: ['bank', 'recent'], queryFn: () => api.bank.recent(7), enabled: bank !== null })
  const [refreshing, setRefreshing] = useState(false)
  const [picks, setPicks] = useState<Record<number, RowPick>>({})
  const onPick = useCallback((id: number, pk: RowPick) => setPicks((x) => ({ ...x, [id]: pk })), [])
  const rows = inbox.data
  const posted = (rows ?? []).filter((r) => !r.pending)
  const pending = (rows?.length ?? 0) - posted.length
  const asks = bank?.ask ?? []
  const added = recent.data ?? []
  const all = addAllPlan(posted, picks, (id) => L.cat.get(id))
  const adding = useBusy()

  // Opening the check-in counts as having seen what's in it, however it was opened (setup's last page, Summary).
  useEffect(() => { if (rows) saveSeenFor(server, { day: todayISO(), maxId: newestId(rows) }) }, [rows, server])

  const addAll = () => adding.run(async () => {
    const plan = addAllPlan(posted, picks, (id) => L.cat.get(id))
    const made: Txn[] = []
    let missed = 0
    let error: unknown = null
    try {
      if (plan.ids.length) made.push(...await api.bank.acceptMany(plan.ids))
      for (const x of plan.each) {
        try { made.push(await api.bank.accept(x.id, x.body)) } catch (e) { if (!already(e)) { missed++; error ??= e } }
      }
    } catch (e) { error = e; missed = plan.count - made.length }
    await refreshBank().catch(() => {})
    if (made.length) {
      if (missed) warning(); else success()
      notify({ text: missed ? `Added ${made.length} · ${missed} Not Added` : `Added ${made.length}`, symbol: 'checkmark.circle.fill',
        action: { label: 'Undo', run: async () => { await api.bulk({ ids: made.map((t) => t.id), action: 'delete' }); await refreshBank() } } })
    } else if (error) {
      failure()
      notify({ text: why(error, "Couldn't add them"), ...oops })
    }
  })
  const reload = async () => { await Promise.all([inbox.refetch(), bankQ.refetch(), recent.refetch()]) }
  const refresh = async () => { setRefreshing(true); try { await api.bank.sync(0).catch(() => {}); await refreshBank() } finally { setRefreshing(false) } }

  const off = bank === null || (inbox.error instanceof ApiError && inbox.error.status === 404)
  const done = rows && !posted.length && !asks.length
  let body
  if (off) body = <Empty symbol="building.columns" title="No Bank Connections" body="This server doesn’t connect to banks." />
  else if (!rows && inbox.isError) {
    body = (
      <Empty symbol="icloud.slash" title="Can’t Reach Tally" body={why(inbox.error, 'Check your connection and try again.')}>
        <Button label="Try Again" kind="tinted" onPress={reload} style={{ marginTop: space.l, alignSelf: 'stretch' }} />
      </Empty>
    )
  } else if (!rows) body = <ActivityIndicator style={{ marginTop: 80 }} color={p.label2} />
  else {
    body = (
      <>
        {done && <Empty symbol="checkmark.circle" title="You’re All Caught Up" body={pending ? `${pending} pending at the bank.` : 'Everything from your banks is in Tally.'} />}
        {posted.length > 0 && (
          <Section title="To Review" compact inset={70} footer={`Swipe right to add, left to skip.${pending ? ` ${pending} pending at the bank.` : ''}`}>
            {posted.map((r) => <Waiting key={r.id} r={r} pick={picks[r.id]} onPick={(pk) => onPick(r.id, pk)} />)}
          </Section>
        )}
        {all.count > 1 && <Button label={`Add All ${all.count}`} kind="tinted" onPress={addAll} busy={adding.on} />}
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
      </>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60, gap: space.xxl }}
        refreshControl={off ? undefined : <RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <SheetHeader title="From Your Bank" subtitle={posted.length ? `${posted.length} to review` : undefined} />
        <View style={{ paddingHorizontal: space.l, gap: space.xxl }}>{body}</View>
      </ScrollView>
    </View>
  )
}
