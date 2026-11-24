// From Your Bank: what the banks brought that Tally wasn't sure of (pick a category, it's added), bank accounts it
// doesn't know yet, and what it added by itself this week, to look over or take back.
import { useState } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError, type BankAsk, type BankRecent, type BankRow, type CatType } from '@/lib/api'
import { refreshBank, useBank, useBankInbox } from '@/lib/bank'
import { dayLabel } from '@/lib/dates'
import { deleteEntry } from '@/next/actions'
import { failure, success } from '@/next/haptics'
import { useLedger } from '@/next/ledger'
import { amountLook, categoryLook, KIND_LOOK, wantsLogo } from '@/next/look'
import { space, usePalette } from '@/next/theme'
import { Button } from '@/next/ui/Button'
import { Empty, Section } from '@/next/ui/List'
import { Logo } from '@/next/ui/Logo'
import { Money } from '@/next/ui/Money'
import { Choice } from '@/next/ui/native/Choice'
import { notify } from '@/next/ui/Notice'
import { Press } from '@/next/ui/Press'
import { SheetHeader } from '@/next/ui/SheetHeader'
import { Txt } from '@/next/ui/Txt'

const LEAVE = LinearTransition.springify().damping(18).stiffness(200)
const NOT_TRACKED = -1

function Waiting({ r }: { r: BankRow }) {
  const p = usePalette()
  const L = useLedger()
  const g = r.guess
  const out = r.amount > 0
  const [cat, setCat] = useState<number | null>(g?.category_id ?? null)
  const [busy, setBusy] = useState(false)
  const c = cat !== null ? L.cat.get(cat) : undefined
  const look = categoryLook(c)
  const types: CatType[] = out ? ['Spending'] : ['Money in', 'Spending']
  const options = (L.b?.categories ?? []).filter((x) => x.active && (types.includes(x.type) || x.id === g?.category_id))
  const name = g?.what || r.merchant || r.raw
  const add = async () => {
    if (cat === null) return
    setBusy(true)
    try {
      const e = await api.bank.accept(r.id, cat === g?.category_id ? {} : { category_id: cat })
      success()
      await refreshBank()
      notify({ text: `Added ${e.what}`, symbol: 'checkmark.circle.fill', action: { label: 'Undo', run: async () => { await api.deleteTxn(e.id); await api.bank.reset(r.id); await refreshBank() } } })
    } catch (err) {
      failure(); setBusy(false)
      notify({ text: err instanceof ApiError ? err.errors.join(' ') : "Couldn't add it", symbol: 'exclamationmark.triangle.fill', hue: 'orange' })
    }
  }
  const amt = amountLook(out ? 'Spending' : 'Money in', out ? r.amount : -r.amount)
  return (
    <Animated.View exiting={FadeOut.duration(180)} layout={LEAVE} style={{ paddingHorizontal: space.l, paddingVertical: space.m, gap: space.m }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <Logo name={wantsLogo(c?.type ?? 'Spending') ? (r.merchant || name) : undefined} symbol={look.symbol} color={c ? p[look.hue] : p.gray} size={42} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="body" numberOfLines={1}>{name}</Txt>
          <Txt v="subhead" tone="label2" numberOfLines={1}>{dayLabel(r.authorized_date ?? r.date, L.today)} · {L.acct.get(r.account_id)?.name ?? r.bank_account}</Txt>
        </View>
        <Money cents={amt.cents} plus={amt.plus} tone={amt.tone} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 54 }}>
        <Choice options={options.map((x) => [x.id, x.name])} value={cat} onChange={setCat} none="Choose Category" />
        <Press onPress={add} disabled={cat === null || busy} accessibilityLabel={`Add ${name}`}
          style={{ height: 32, paddingHorizontal: 14, borderRadius: 16, justifyContent: 'center', backgroundColor: cat === null ? p.fill3 : p.blue, opacity: busy ? 0.5 : 1 }}>
          <Txt v="subhead" weight="600" color={cat === null ? p.label3 : '#FFFFFF'}>Add</Txt>
        </Press>
      </View>
      {r.raw && r.raw !== name ? <Txt v="caption" tone="label3" numberOfLines={1} style={{ paddingLeft: 54, marginTop: -space.s }}>{r.raw}</Txt> : null}
    </Animated.View>
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
    <Animated.View exiting={FadeOut.duration(180)} layout={LEAVE} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: 10 }}>
      <Logo name={wantsLogo(c?.type) ? x.what : undefined} symbol={look.symbol} color={p[look.hue]} size={42} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="body" numberOfLines={1}>{x.what}</Txt>
        <Txt v="subhead" tone="label2" numberOfLines={1}>{c?.name} · {dayLabel(x.date, L.today)}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Money cents={amt.cents} plus={amt.plus} tone={amt.tone} />
        <Press feel="none" onPress={() => deleteEntry({ id: x.txn_id })} hitSlop={8} accessibilityLabel={`Remove ${x.what}`}>
          <Txt v="footnote" tone="red">Remove</Txt>
        </Press>
      </View>
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
        <SheetHeader title="From Your Bank" subtitle={posted.length ? `${posted.length} ${posted.length === 1 ? 'needs' : 'need'} a look` : undefined} />
        <View style={{ paddingHorizontal: space.l, gap: space.xxl }}>
          {done && <Empty symbol="checkmark.circle" title="You're All Caught Up" body="Everything from your banks is in Tally." />}
          {posted.length > 0 && (
            <Section title="Needs You" inset={70} footer={pending ? `${pending} more ${pending === 1 ? 'is' : 'are'} still pending at the bank.` : undefined}>
              {posted.map((r) => <Waiting key={r.id} r={r} />)}
            </Section>
          )}
          {guessed.length > 1 && <Button label={`Add ${guessed.length} with Their Categories`} kind="tinted" onPress={addAll} busy={adding} />}
          {asks.length > 0 && (
            <Section title="New Accounts" inset={64} footer="Tell Tally which of your accounts each one is, and its transactions start coming in.">
              {asks.map((a) => <Ask key={a.id} a={a} />)}
            </Section>
          )}
          {added.length > 0 && (
            <Section title="Added for You" aside="This week" inset={70}>
              {added.slice(0, 30).map((x) => <Added key={x.id} x={x} />)}
            </Section>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
