// Summary: what this month has cost so far, the week day by day, what just happened, and anything from the bank.
import { useMemo, useState } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { router, Stack } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { refreshBank, useBank } from '@/lib/bank'
import { useTransactions } from '@/lib/data'
import { addDays, fromISO, monthOf } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { useLedger } from '@/next/ledger'
import { categoryLook } from '@/next/look'
import { space, usePalette } from '@/next/theme'
import { LabTag } from '@/next/ui/LabTag'
import { Card, Empty, Row, Section, Tile } from '@/next/ui/List'
import { Money, Rolling } from '@/next/ui/Money'
import { Txt } from '@/next/ui/Txt'
import { TxnRow } from '@/next/ui/TxnRow'
import { WeekChart, type Day } from '@/next/ui/WeekChart'

const HEADER = (
  <>
    <Stack.Screen options={{ headerLeft: () => <LabTag /> }} />
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button icon="plus" accessibilityLabel="Add a transaction" onPress={() => router.push('/next/add')} />
    </Stack.Toolbar>
  </>
)

const monthName = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'long' })
const weekday = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { weekday: 'long' })

export default function Summary() {
  const p = usePalette()
  const L = useLedger()
  const bank = useBank().data
  const recent = useQuery({ queryKey: ['bank', 'recent'], queryFn: () => api.bank.recent(7), enabled: !!bank })
  const [refreshing, setRefreshing] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)

  const start = addDays(L.today, -fromISO(L.today).getDay())
  const week = useTransactions({ type: 'Spending', start, end: addDays(start, 6), limit: 500 })
  const latest = useTransactions({ end: L.today, sort: 'date', dir: 'desc', limit: 6 })

  const days: Day[] = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i)
    const items = (week.data?.items ?? []).filter((t) => t.date === date)
    const by = new Map<string, number>()
    for (const t of items) {
      const color = p[categoryLook(L.cat.get(t.category_id)).hue]
      by.set(color, (by.get(color) ?? 0) + Math.max(0, t.amount))
    }
    return { date, letter: 'SMTWTFS'[i], today: date === L.today, total: items.reduce((n, t) => n + Math.max(0, t.amount), 0),
      parts: [...by].map(([color, cents]) => ({ color, cents })).filter((x) => x.cents > 0) }
  }), [week.data, start, L.today, L.cat, p])

  const m = L.month
  const ym = monthOf(L.today)
  const prev = L.b?.months[(L.b?.months.findIndex((x) => x.month === ym) ?? 0) - 1]
  const budget = (L.b?.categories ?? []).filter((c) => c.type === 'Spending' && c.active)
    .reduce((n, c) => n + (L.b?.budgets.find((x) => x.category_id === c.id && x.month === ym)?.amount ?? c.budget ?? 0), 0)
  const spent = m?.spent ?? 0
  const share = budget > 0 ? Math.min(1, spent / budget) : 0
  const waiting = bank?.waiting ?? 0
  const added = recent.data?.length ?? 0
  const weekTotal = days.reduce((n, d) => n + d.total, 0)

  const refresh = async () => {
    setRefreshing(true)
    try { if (bank) await api.bank.sync(0).catch(() => {}); await refreshBank() } finally { setRefreshing(false) }
  }

  return (
    <>
      {HEADER}
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }}
        contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {L.b && !L.b.accounts.length ? (
          <Empty symbol="building.columns" title="No Accounts Yet" body="Connect a bank in Settings to start." />
        ) : (
          <>
            {bank && (waiting > 0 || added > 0) && (
              <Card>
                <Row leading={<Tile symbol={waiting ? 'tray.full.fill' : 'checkmark'} color={waiting ? p.blue : p.green} />}
                  title="From Your Bank" chevron onPress={() => router.push('/next/check-in')}
                  subtitle={[waiting ? `${waiting} ${waiting === 1 ? 'needs' : 'need'} you` : '', added ? `${added} added for you` : ''].filter(Boolean).join(' · ')} />
              </Card>
            )}

            <Card pad style={{ gap: space.xs, paddingVertical: space.xl }}>
              <Txt v="subhead" tone="label2" weight="600">Spent in {monthName(ym)}</Txt>
              <Rolling cents={spent} />
              {budget > 0 ? (
                <View style={{ gap: space.s, marginTop: space.s }}>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: p.fill3, overflow: 'hidden' }}>
                    <View style={{ width: `${share * 100}%`, height: 8, borderRadius: 4, backgroundColor: share >= 1 ? p.red : share > 0.85 ? p.orange : p.blue }} />
                  </View>
                  <Txt v="subhead" tone="label2">
                    <Txt v="subhead" weight="600" tone={budget - spent < 0 ? 'red' : 'label'}>{formatCents(Math.abs(budget - spent), { cents: false })} {budget - spent < 0 ? 'over' : 'left'}</Txt>
                    {` of ${formatCents(budget, { cents: false })}`}
                  </Txt>
                </View>
              ) : prev ? (
                <Txt v="subhead" tone="label2">{formatCents(prev.spent, { cents: false })} in {monthName(prev.month)}</Txt>
              ) : null}
            </Card>

            <Section title="This Week">
              <View style={{ padding: space.l, gap: space.l }}>
                <View>
                  <Txt v="subhead" tone="label2">{picked === null ? 'Total' : weekday(days[picked].date)}</Txt>
                  <Money cents={picked === null ? weekTotal : days[picked].total} v="title2" weight="700" />
                </View>
                <WeekChart days={days} picked={picked} onPick={setPicked} />
              </View>
            </Section>

            <Section title="Latest" action={{ label: 'See All', onPress: () => router.push('/next/activity') }} inset={70}>
              {(latest.data?.items ?? []).map((t) => <TxnRow key={t.id} t={t} showDate />)}
            </Section>
            {latest.data && !latest.data.items.length && <Empty symbol="list.bullet.rectangle" title="No Transactions Yet" />}
          </>
        )}
      </ScrollView>
    </>
  )
}
