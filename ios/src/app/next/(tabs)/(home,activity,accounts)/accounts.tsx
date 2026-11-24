// Accounts: net worth over time (drag across the line to read any month), then every account by kind with its
// bank's logo and balance.
import { useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { router, Stack } from 'expo-router'
import type { Kind } from '@/lib/api'
import { useBank } from '@/lib/bank'
import { fromISO } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { useLedger } from '@/next/ledger'
import { KIND_LOOK } from '@/next/look'
import { space, usePalette } from '@/next/theme'
import { LabTag } from '@/next/ui/LabTag'
import { Card, Empty, Row, Section, Tile } from '@/next/ui/List'
import { LineChart } from '@/next/ui/LineChart'
import { Logo } from '@/next/ui/Logo'
import { Rolling } from '@/next/ui/Money'
import { Txt } from '@/next/ui/Txt'

const KINDS: Kind[] = ['cash', 'card', 'investment', 'loan']
const HEADER = (
  <>
    <Stack.Screen options={{ headerLeft: () => <LabTag /> }} />
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button icon="gearshape" accessibilityLabel="Settings" onPress={() => router.push('/next/settings')} />
    </Stack.Toolbar>
  </>
)
const longMonth = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

export default function Accounts() {
  const p = usePalette()
  const L = useLedger()
  const bank = useBank().data
  const [scrub, setScrub] = useState<number | null>(null)
  const months = useMemo(() => (L.b?.months ?? []).filter((m) => m.month <= (L.month?.month ?? '')), [L.b, L.month])
  const now = L.month
  const shown = scrub !== null ? months[scrub] : now
  const prev = months.at(-2)
  const change = now && prev ? now.net_worth - prev.net_worth : 0
  const accounts = (L.b?.accounts ?? []).filter((a) => a.active)

  return (
    <>
      {HEADER}
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }}
        contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 120 }}>
        {L.b && !accounts.length ? <Empty symbol="building.columns" title="No Accounts" body="Connect a bank in Settings." /> : (
          <>
            <Card pad style={{ gap: space.xs, paddingTop: space.xl }}>
              <Txt v="subhead" tone="label2" weight="600">Net Worth</Txt>
              <Rolling cents={shown?.net_worth ?? 0} noCents />
              <Txt v="subhead" tone={scrub !== null ? 'label2' : change >= 0 ? 'green' : 'red'} weight="600">
                {scrub !== null ? longMonth(months[scrub].month) : `${change >= 0 ? '▲' : '▼'} ${formatCents(Math.abs(change), { cents: false })} this month`}
              </Txt>
              {months.length > 1 && (
                <View style={{ marginTop: space.l, marginHorizontal: -space.l }}>
                  <LineChart points={months.map((m) => m.net_worth)} color={change >= 0 ? p.green : p.red} onScrub={setScrub} />
                </View>
              )}
            </Card>

            {KINDS.map((k) => {
              const list = accounts.filter((a) => a.kind === k)
              if (!list.length) return null
              const look = KIND_LOOK[k]
              const total = list.reduce((n, a) => n + (now?.balances[a.id] ?? 0), 0)
              return (
                <Section key={k} title={look.title} aside={formatCents(total, { cents: false })} inset={64}>
                  {list.map((a) => (
                    <Row key={a.id} leading={<Logo account={a.id} symbol={look.symbol} color={p[look.hue]} size={36} />}
                      title={a.name} subtitle={a.bank ? a.bank.replace(/^./, (c) => c.toUpperCase()) : look.one}
                      value={formatCents(now?.balances[a.id] ?? 0)} valueTone="label" chevron
                      onPress={() => router.push({ pathname: '/next/account/[id]', params: { id: String(a.id) } })} />
                  ))}
                </Section>
              )
            })}

            {bank && (
              <Section>
                <Row leading={<Tile symbol="building.columns.fill" color={p.blue} size={30} />} title="Connected Banks"
                  value={String(bank.items.length)} chevron onPress={() => router.push('/next/settings/banks')} />
              </Section>
            )}
          </>
        )}
      </ScrollView>
    </>
  )
}
