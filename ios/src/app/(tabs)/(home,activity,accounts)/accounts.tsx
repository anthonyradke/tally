// Accounts: net worth over time (drag across the line to read any month), your cards and bank accounts stacked like
// Wallet (tap one and it zooms open into its page), then investments and loans with their banks' logos.
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native'
import { Link, router, Stack } from 'expo-router'
import type { Kind } from '@/lib/api'
import { useBank } from '@/lib/bank'
import { fromISO } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { useLedger } from '@/design/ledger'
import { bankName, KIND_LOOK } from '@/design/look'
import { space, usePalette } from '@/design/theme'
import { Card, Empty, Row, Section, Tile } from '@/design/ui/List'
import { LineChart } from '@/design/ui/LineChart'
import { Logo } from '@/design/ui/Logo'
import { Rolling } from '@/design/ui/Money'
import { Txt } from '@/design/ui/Txt'
import { CARD_RATIO, WalletCard } from '@/design/ui/WalletCard'

const LISTED: Kind[] = ['investment', 'loan']
const PEEK = 62 // how much of each card shows above the next, as in Wallet
const HEADER = (
  <>
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button icon="gearshape" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
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
  const { width } = useWindowDimensions()
  const cardW = width - space.l * 2
  // Cards first, then bank accounts, like Wallet's payment cards; each group's biggest balance in front.
  const deck = accounts.filter((a) => a.kind === 'card' || a.kind === 'cash')
    .sort((x, y) => (x.kind === y.kind ? Math.abs(now?.balances[x.id] ?? 0) - Math.abs(now?.balances[y.id] ?? 0) : x.kind === 'card' ? 1 : -1))

  return (
    <>
      {HEADER}
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }}
        contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 120 }}>
        {L.b && !accounts.length ? <Empty symbol="building.columns" title="No Accounts" body="Add a bank in Settings." /> : (
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

            {deck.length > 0 && (
              <View style={{ gap: space.s }}>
                <Txt v="title3" weight="700" style={{ paddingHorizontal: space.xs }}>Wallet</Txt>
                <View style={{ height: cardW / CARD_RATIO + (deck.length - 1) * PEEK }}>
                  {deck.map((a, i) => (
                    <View key={a.id} style={{ position: 'absolute', top: i * PEEK, left: 0 }}>
                      <Link href={{ pathname: '/account/[id]', params: { id: String(a.id) } }} asChild>
                        <Link.Trigger withAppleZoom>
                          <Pressable accessibilityLabel={`${a.name}, ${formatCents(now?.balances[a.id] ?? 0)}`}>
                            <WalletCard a={a} balance={now?.balances[a.id] ?? 0} width={cardW} />
                          </Pressable>
                        </Link.Trigger>
                      </Link>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {LISTED.map((k) => {
              const list = accounts.filter((a) => a.kind === k)
              if (!list.length) return null
              const look = KIND_LOOK[k]
              const total = list.reduce((n, a) => n + (now?.balances[a.id] ?? 0), 0)
              return (
                <Section key={k} title={look.title} aside={formatCents(total, { cents: false })} inset={64}>
                  {list.map((a) => (
                    <Row key={a.id} leading={<Logo account={a.id} symbol={look.symbol} color={p[look.hue]} size={36} />}
                      title={a.name} subtitle={bankName(a) ?? look.one}
                      value={formatCents(now?.balances[a.id] ?? 0)} valueTone="label" chevron
                      onPress={() => router.push({ pathname: '/account/[id]', params: { id: String(a.id) } })} />
                  ))}
                </Section>
              )
            })}

            {bank && (
              <Section>
                <Row leading={<Tile symbol="building.columns.fill" color={p.tint} size={30} />} title="Connected Banks"
                  value={String(bank.items.length)} chevron onPress={() => router.push('/settings/banks')} />
              </Section>
            )}
          </>
        )}
      </ScrollView>
    </>
  )
}
