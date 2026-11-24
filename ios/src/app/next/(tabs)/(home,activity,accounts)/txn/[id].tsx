// One entry, the way Apple Card shows a transaction: the place's logo and name, the amount large, the details in a
// card, the other times you went there, and Edit and Delete.
import { ScrollView, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cachedTxn, useTransactions } from '@/lib/data'
import { fromISO } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { deleteEntry, hideLogo } from '@/next/actions'
import { useLedger } from '@/next/ledger'
import { amountLook, categoryLook, KIND_LOOK, wantsLogo } from '@/next/look'
import { space, usePalette } from '@/next/theme'
import { Card, Empty, Row, Section, Tile } from '@/next/ui/List'
import { Logo } from '@/next/ui/Logo'
import { Money } from '@/next/ui/Money'
import { Txt } from '@/next/ui/Txt'
import { TxnRow } from '@/next/ui/TxnRow'

const fullDate = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

export default function TxnPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const tid = Number(id)
  const p = usePalette()
  const L = useLedger()
  const q = useQuery({ queryKey: ['transactions', 'one', tid], queryFn: () => api.transaction(tid), initialData: () => cachedTxn(tid) })
  const t = q.data
  const c = t ? L.cat.get(t.category_id) : undefined
  const type = c?.type
  const same = useTransactions({ q: t?.what, sort: 'date', dir: 'desc', limit: 6 }, !!t?.what && wantsLogo(type))
  if (!t) return q.isPending ? null : <Empty symbol="questionmark.circle" title="Transaction Not Found" />
  const look = categoryLook(c)
  const amt = amountLook(type, t.amount)
  const from = t.from_id ? L.acct.get(t.from_id) : undefined
  const to = t.to_id ? L.acct.get(t.to_id) : undefined
  const others = (same.data?.items ?? []).filter((x) => x.id !== t.id && x.what.toLowerCase() === t.what.toLowerCase())
  const acctRow = (label: string, a: typeof from) => a && (
    <Row leading={<Logo account={a.id} symbol={KIND_LOOK[a.kind].symbol} color={p[KIND_LOOK[a.kind].hue]} size={30} />} title={label} value={a.name} />
  )
  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button accessibilityLabel="Edit" onPress={() => router.push({ pathname: '/next/add', params: { id: String(t.id) } })}>Edit</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }}
        contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 120 }}>
        <View style={{ alignItems: 'center', gap: space.s, paddingTop: space.s }}>
          <Logo name={wantsLogo(type) ? t.what : undefined} symbol={look.symbol} color={p[look.hue]} size={76} />
          <Txt v="title2" center style={{ marginTop: space.s }}>{t.what || c?.name}</Txt>
          <Money cents={amt.cents} plus={amt.plus} tone={amt.tone === 'quiet' ? 'plain' : amt.tone} v="largeTitle" />
          <Txt v="subhead" tone="label2">{fullDate(t.date)}{t.date > L.today ? ' · Scheduled' : ''}</Txt>
        </View>

        <Section inset={62}>
          <Row leading={<Tile symbol={look.symbol} color={p[look.hue]} size={30} />} title="Category" value={c?.name ?? 'Unknown'} />
          {type === 'Money in' ? acctRow('Deposited To', to) : type === 'Spending' ? acctRow(t.amount < 0 ? 'Refunded To' : 'Paid With', from) : (
            <>{acctRow('From', from)}{acctRow('To', to)}</>
          )}
        </Section>

        {t.note ? (
          <Section title="Note">
            <View style={{ padding: space.l }}><Txt v="body" selectable>{t.note}</Txt></View>
          </Section>
        ) : null}

        {others.length > 0 && (
          <Section title={`More at ${t.what}`} aside={`${others.length + 1} times · ${formatCents([t, ...others].reduce((n, x) => n + Math.max(0, x.amount), 0), { cents: false })}`} inset={70}>
            {others.slice(0, 5).map((x) => <TxnRow key={x.id} t={x} showDate />)}
          </Section>
        )}

        <Card>
          {wantsLogo(type) && t.what ? (
            <>
              <Row title="Wrong Logo" tint onPress={() => hideLogo(t.what)} />
              <View style={{ height: 0.5, backgroundColor: p.separator, marginLeft: space.l }} />
            </>
          ) : null}
          <Row title="Delete Transaction" destructive onPress={() => { deleteEntry(t); router.back() }} />
        </Card>
      </ScrollView>
    </>
  )
}
