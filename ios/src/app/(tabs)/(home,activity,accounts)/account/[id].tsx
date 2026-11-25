// One account: its balance and how it got there month by month, then its entries.
import { useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useTransactions } from '@/lib/data'
import { fromISO } from '@/lib/dates'
import { useLedger } from '@/design/ledger'
import { KIND_LOOK } from '@/design/look'
import { space, usePalette } from '@/design/theme'
import { Card, Empty, Section } from '@/design/ui/List'
import { LineChart } from '@/design/ui/LineChart'
import { Logo } from '@/design/ui/Logo'
import { Rolling } from '@/design/ui/Money'
import { Txt } from '@/design/ui/Txt'
import { TxnRow } from '@/design/ui/TxnRow'

const longMonth = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

export default function AccountPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const aid = Number(id)
  const p = usePalette()
  const L = useLedger()
  const a = L.acct.get(aid)
  const [scrub, setScrub] = useState<number | null>(null)
  const months = useMemo(() => (L.b?.months ?? []).filter((m) => m.month <= (L.month?.month ?? '')), [L.b, L.month])
  const list = useTransactions({ account: aid, sort: 'date', dir: 'desc', limit: 60 })
  if (!a) return <Empty symbol="questionmark.circle" title="Account Not Found" />
  const look = KIND_LOOK[a.kind]
  const balance = scrub !== null ? months[scrub]?.balances[aid] ?? 0 : L.month?.balances[aid] ?? 0
  return (
    <>
      <Stack.Screen options={{ title: a.name }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }}
        contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 120 }}>
        <Card pad style={{ gap: space.xs, paddingTop: space.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, marginBottom: space.s }}>
            <Logo account={aid} symbol={look.symbol} color={p[look.hue]} size={44} />
            <View style={{ flex: 1 }}>
              <Txt v="headline" numberOfLines={1}>{a.name}</Txt>
              <Txt v="subhead" tone="label2">{scrub !== null ? longMonth(months[scrub].month) : a.kind === 'card' || a.kind === 'loan' ? `${look.one} · Owed` : look.one}</Txt>
            </View>
          </View>
          <Rolling cents={balance} />
          {months.length > 1 && (
            <View style={{ marginTop: space.l, marginHorizontal: -space.l }}>
              <LineChart points={months.map((m) => m.balances[aid] ?? 0)} color={p[look.hue]} onScrub={setScrub} />
            </View>
          )}
        </Card>
        <Section title="Transactions" inset={70}>
          {(list.data?.items ?? []).map((t) => <TxnRow key={t.id} t={t} showDate />)}
        </Section>
        {list.data && !list.data.items.length && <Empty symbol="list.bullet.rectangle" title="No Transactions" />}
      </ScrollView>
    </>
  )
}
