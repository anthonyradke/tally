// Accounts: net worth over time (drag across the line to read any month), your cards and bank accounts stacked like
// Wallet (tap one and it zooms open into its page), then investments and loans with their banks' logos. A hidden
// account that still holds money (or owes it) stays here, in its own section, since net worth counts it.
import { useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native'
import { Link, router, Stack } from 'expo-router'
import type { Account, Kind } from '@/lib/api'
import { useBank } from '@/lib/bank'
import { fromISO } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { useRefresh } from '@/design/feed'
import { pastMonths, useLedger } from '@/design/ledger'
import { bankName, KIND_LOOK } from '@/design/look'
import { space, usePalette } from '@/design/theme'
import { Card, Empty, Row, Section, Tile } from '@/design/ui/List'
import { LineChart } from '@/design/ui/LineChart'
import { loadGate } from '@/design/ui/LoadState'
import { Logo } from '@/design/ui/Logo'
import { Rolling } from '@/design/ui/Money'
import { Txt } from '@/design/ui/Txt'
import { CARD_RATIO, useCardFaces, WalletCard } from '@/design/ui/WalletCard'

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
const whole = (c: number) => formatCents(c, { cents: false })

export default function Accounts() {
  const p = usePalette()
  const L = useLedger()
  const gate = loadGate(L.q)
  const bank = useBank().data
  const faces = useCardFaces().data
  const { refreshing, refresh } = useRefresh()
  const [scrub, setScrub] = useState<number | null>(null)
  // Balances carry over: the latest month up to today holds today's. "This month" only once its row is there.
  const months = useMemo(() => pastMonths(L.b, L.today), [L.b, L.today])
  const now = months[months.length - 1]
  const shown = scrub !== null ? months[scrub] : now
  const change = L.month && months.length > 1 ? L.month.net_worth - months[months.length - 2].net_worth : 0
  const trend = months.length > 1 ? months[months.length - 1].net_worth - months[0].net_worth : 0
  const balance = (a: Account) => now?.balances[a.id] ?? 0
  const all = L.b?.accounts ?? []
  const accounts = all.filter((a) => a.active)
  const hidden = all.filter((a) => !a.active && balance(a) !== 0)
  const { width } = useWindowDimensions()
  const cardW = width - space.l * 2
  // Bank accounts at the back and cards in front, like Wallet's payment cards; within each, the biggest balance
  // nearest the front. The front card shows everything; the ones behind show their name in the strip that peeks out.
  const deck = accounts.filter((a) => a.kind === 'card' || a.kind === 'cash')
    .sort((x, y) => (x.kind === y.kind ? Math.abs(balance(x)) - Math.abs(balance(y)) : x.kind === 'card' ? 1 : -1))
  // The Wallet's totals add up the cards it shows (a hidden account's money is under Hidden, not here).
  const sum = (list: Account[], kind: Account['kind']) => list.filter((a) => a.kind === kind).reduce((n, a) => n + balance(a), 0)
  const strip = (a: Account) => { const mask = faces?.[String(a.id)]?.mask; return mask ? `${a.name} •• ${mask}` : a.name }

  return (
    <>
      {HEADER}
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }}
        contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {gate.block ?? (L.b && !all.length ? <Empty symbol="building.columns" title="No Accounts" body={bank ? 'Connect a bank in Settings.' : undefined} /> : (
          <>
            {gate.note}
            <Card pad style={{ gap: space.xs, paddingTop: space.xl }}>
              <Txt v="subhead" tone="label2" weight="600">Net Worth</Txt>
              <Rolling cents={shown?.net_worth ?? 0} noCents />
              <Txt v="subhead" tone={scrub !== null || change === 0 ? 'label2' : change > 0 ? 'green' : 'red'} weight="600">
                {scrub !== null ? longMonth(months[scrub].month)
                  : change === 0 ? 'No change this month' : `${change > 0 ? '▲' : '▼'} ${whole(Math.abs(change))} this month`}
              </Txt>
              {months.length > 1 && (
                <View style={{ marginTop: space.l, marginHorizontal: -space.l }}>
                  <LineChart points={months.map((m) => m.net_worth)} color={trend >= 0 ? p.green : p.red} onScrub={setScrub} />
                </View>
              )}
            </Card>

            {deck.length > 0 && (
              <View style={{ gap: space.s }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space.xs }}>
                  <Txt v="title3" weight="700">Wallet</Txt>
                  <Txt v="subhead" tone="label2" num numberOfLines={1}>
                    {[deck.some((a) => a.kind === 'cash') ? `${whole(sum(deck, 'cash'))} cash` : '', deck.some((a) => a.kind === 'card') ? `${whole(sum(deck, 'card'))} on cards` : ''].filter(Boolean).join(' · ')}
                  </Txt>
                </View>
                <View style={{ height: cardW / CARD_RATIO + (deck.length - 1) * PEEK }}>
                  {deck.map((a, i) => (
                    <View key={a.id} style={{ position: 'absolute', top: i * PEEK, left: 0 }}>
                      <Link href={{ pathname: '/account/[id]', params: { id: String(a.id) } }} asChild>
                        <Link.Trigger withAppleZoom>
                          <Pressable accessibilityLabel={`${a.name}, ${formatCents(balance(a))}`}>
                            <WalletCard a={a} balance={balance(a)} width={cardW} title={i < deck.length - 1 ? strip(a) : undefined} />
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
              return (
                <Section key={k} title={look.title} aside={whole(list.reduce((n, a) => n + balance(a), 0))} inset={64}>
                  {list.map((a) => <AccountRow key={a.id} a={a} balance={balance(a)} subtitle={bankName(a) ?? look.one} />)}
                </Section>
              )
            })}

            {hidden.length > 0 && (
              <Section title="Hidden" inset={64} footer="Hidden in Settings, but still counted in net worth.">
                {hidden.map((a) => <AccountRow key={a.id} a={a} balance={balance(a)} subtitle={KIND_LOOK[a.kind].one} />)}
              </Section>
            )}

            {bank && (
              <Section>
                <Row leading={<Tile symbol="building.columns.fill" color={p.tint} size={30} />} title="Connected Banks"
                  value={String(bank.items.length)} chevron onPress={() => router.push('/settings/banks')} />
              </Section>
            )}
          </>
        ))}
      </ScrollView>
    </>
  )
}

function AccountRow({ a, balance, subtitle }: { a: Account; balance: number; subtitle: string }) {
  const p = usePalette()
  const look = KIND_LOOK[a.kind]
  return (
    <Row leading={<Logo account={a.id} symbol={look.symbol} color={p[look.hue]} size={36} />} title={a.name} subtitle={subtitle}
      value={formatCents(balance)} valueTone="label" chevron
      onPress={() => router.push({ pathname: '/account/[id]', params: { id: String(a.id) } })} />
  )
}
