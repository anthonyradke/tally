// One entry, the way Apple Card shows a transaction: the place's logo and name, the amount large, the details in a
// card (category and accounts open their pages), its receipt, tags and split, the other times you went there, and
// Edit and Delete. The top of the page takes the place's brand color.
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import { api, ApiError, type Account } from '@/lib/api'
import { useTransactions, useTxn } from '@/lib/data'
import { fromISO } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { authHeaders } from '@/lib/server'
import { deleteEntry, hideLogo } from '@/design/actions'
import { loadOf, useLedger, visits } from '@/design/ledger'
import { amountLook, categoryLook, KIND_LOOK, wantsLogo } from '@/design/look'
import { space, usePalette } from '@/design/theme'
import { BrandWash, useBrandColor } from '@/design/ui/BrandWash'
import { Card, Empty, Row, Section, Tile } from '@/design/ui/List'
import { Blocked } from '@/design/ui/LoadState'
import { Logo } from '@/design/ui/Logo'
import { Money } from '@/design/ui/Money'
import { Txt } from '@/design/ui/Txt'
import { TxnRow } from '@/design/ui/TxnRow'

const fullDate = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
const isPdf = (name: string) => /\.pdf$/i.test(name)

export default function TxnPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const tid = Number(id)
  const p = usePalette()
  const L = useLedger()
  const [found, setFound] = useState(false)
  const q = useTxn(tid)
  const t = q.data
  const c = t ? L.cat.get(t.category_id) : undefined
  const type = c?.type
  const place = !!t?.what && wantsLogo(type)
  const brand = useBrandColor(t?.what, place)
  // Every posted entry with exactly this name, counted by the server; scheduled ones haven't happened yet.
  const same = useTransactions({ what: t?.what, end: L.today, sort: 'date', dir: 'desc', limit: 200 }, place)
  const split = useTransactions({ group: t?.split_group ?? undefined, sort: 'date', dir: 'desc', limit: 50 }, !!t?.split_group)
  if (!t) {
    if (q.error instanceof ApiError && q.error.status === 404) return <Empty symbol="questionmark.circle" title="Transaction Not Found" />
    const s = loadOf(q)
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }}>
        <Blocked kind={s.kind === 'ready' ? 'loading' : s.kind} onRetry={q.refetch} />
      </ScrollView>
    )
  }
  const look = categoryLook(c)
  const amt = amountLook(type, t.amount)
  const from = t.from_id ? L.acct.get(t.from_id) : undefined
  const to = t.to_id ? L.acct.get(t.to_id) : undefined
  const been = visits(same.data, t.what, type)
  const others = been.rows.filter((x) => x.id !== t.id)
  const lines = (split.data?.items ?? []).filter((x) => x.id !== t.id)
  const splitTotal = (split.data?.items ?? []).reduce((n, x) => n + x.amount, 0)
  const acctRow = (label: string, a: Account | undefined) => a && (
    <Row leading={<Logo account={a.id} symbol={KIND_LOOK[a.kind].symbol} color={p[KIND_LOOK[a.kind].hue]} size={30} />} title={label} value={a.name} chevron
      onPress={() => router.push({ pathname: '/account/[id]', params: { id: String(a.id) } })} />
  )
  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button accessibilityLabel="Edit" onPress={() => router.push({ pathname: '/add', params: { id: String(t.id) } })}>Edit</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: p.bg }]}><BrandWash color={brand} /></View>
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: 'transparent' }}
        contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 120 }}>
        <View style={{ alignItems: 'center', gap: space.s, paddingTop: space.s }}>
          <Logo name={place ? t.what : undefined} symbol={look.symbol} color={p[look.hue]} size={76} onFound={found ? undefined : () => setFound(true)} />
          <Txt v="title2" center style={{ marginTop: space.s }}>{t.what || c?.name}</Txt>
          <Money cents={amt.cents} plus={amt.plus} tone={amt.tone === 'quiet' ? 'plain' : amt.tone} v="largeTitle" />
          <Txt v="subhead" tone="label2">{fullDate(t.date)}{t.date > L.today ? ' · Scheduled' : ''}</Txt>
        </View>

        <Section inset={62}>
          <Row leading={<Tile symbol={look.symbol} color={p[look.hue]} size={30} />} title="Category" value={c?.name ?? 'Unknown'} chevron={!!c}
            onPress={c ? () => router.push({ pathname: '/category/[id]', params: { id: String(c.id) } }) : undefined} />
          {type === 'Money in' ? acctRow('Deposited To', to) : type === 'Spending' ? acctRow(t.amount < 0 ? 'Refunded To' : 'Paid With', from) : (
            <>{acctRow('From', from)}{acctRow('To', to)}</>
          )}
          {t.tags.length ? <Row leading={<Tile symbol="number" color={p.gray} size={30} />} title="Tags" value={t.tags.map((x) => `#${x}`).join(' ')} /> : null}
        </Section>

        {t.note ? (
          <Section title="Note">
            <View style={{ padding: space.l }}><Txt v="body" selectable>{t.note}</Txt></View>
          </Section>
        ) : null}

        {t.receipt ? (
          isPdf(t.receipt) ? (
            <Section title="Receipt"><Row leading={<Tile symbol="doc.fill" color={p.gray} size={30} />} title="PDF Receipt" subtitle="Open it from the server on a computer." /></Section>
          ) : (
            <Section title="Receipt">
              <Pressable accessibilityRole="imagebutton" accessibilityLabel="Receipt"
                onPress={() => router.push({ pathname: '/receipt/[name]', params: { name: t.receipt! } })}>
                <Image source={{ uri: api.receiptUrl(t.receipt), headers: authHeaders() }} cachePolicy="disk" contentFit="cover" transition={180}
                  style={{ height: 200, backgroundColor: p.fill3 }} />
              </Pressable>
            </Section>
          )
        ) : null}

        {t.split_group && lines.length > 0 && (
          <Section title="Part of a Split" aside={formatCents(Math.abs(splitTotal), { cents: false })} inset={70}>
            {lines.map((x) => <TxnRow key={x.id} t={x} showAccount={false} />)}
          </Section>
        )}

        {others.length > 0 && (
          <Section title={`More at ${t.what}`} inset={70}
            aside={[been.count === 1 ? '1 time' : `${been.count} times`, been.sum > 0 ? formatCents(been.sum, { cents: false }) : ''].filter(Boolean).join(' · ')}>
            {others.slice(0, 5).map((x) => <TxnRow key={x.id} t={x} showDate />)}
          </Section>
        )}

        <Card>
          {place && found ? (
            <>
              <Row title="Hide Logo" tint onPress={() => { hideLogo(t.what); setFound(false) }} />
              <View style={{ height: 0.5, backgroundColor: p.separator, marginLeft: space.l }} />
            </>
          ) : null}
          <Row title="Delete Transaction" destructive onPress={() => { deleteEntry(t); router.back() }} />
        </Card>
      </ScrollView>
    </>
  )
}
