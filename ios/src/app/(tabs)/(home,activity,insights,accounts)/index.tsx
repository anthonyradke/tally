// Summary: what this month has cost so far against a usual month, the week day by day, what just happened, and
// anything from the bank.
import { useMemo, useState } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { router, Stack } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useBank } from '@/lib/bank'
import { useTransactions } from '@/lib/data'
import { addDays, fromISO, lastOfMonth, monthOf } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { useRefresh } from '@/design/feed'
import { useLedger } from '@/design/ledger'
import { categoryLook } from '@/design/look'
import { space, usePalette } from '@/design/theme'
import { addMonths, complete, pace, usualBy, weekDays } from '@/design/trends'
import { Card, Empty, Row, Section, Tile } from '@/design/ui/List'
import { loadGate } from '@/design/ui/LoadState'
import { Money, Rolling } from '@/design/ui/Money'
import { Rings } from '@/design/ui/Ring'
import { Txt } from '@/design/ui/Txt'
import { TxnRow } from '@/design/ui/TxnRow'
import { WeekChart, type Day } from '@/design/ui/WeekChart'

// Settings where iOS keeps an account button, beside the +. Buttons sit directly in the toolbar: anything wrapped is
// dropped in Release builds.
const HEADER = (
  <Stack.Toolbar placement="right">
    <Stack.Toolbar.Button icon="gearshape" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
    <Stack.Toolbar.Button icon="plus" accessibilityLabel="Add a transaction" onPress={() => router.push('/add')} />
  </Stack.Toolbar>
)

const monthName = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'long' })
const weekday = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { weekday: 'long' })
const whole = (c: number) => formatCents(c, { cents: false })

export default function Summary() {
  const p = usePalette()
  const L = useLedger()
  const gate = loadGate(L.q)
  const bank = useBank().data
  const recent = useQuery({ queryKey: ['bank', 'recent'], queryFn: () => api.bank.recent(7), enabled: !!bank })
  const { refreshing, refresh } = useRefresh()
  const [picked, setPicked] = useState<number | null>(null)

  // The week so far: posted spending only, refunds netted out as the month's figure nets them.
  const start = addDays(L.today, -fromISO(L.today).getDay())
  const week = useTransactions({ type: 'Spending', start, end: L.today, limit: 500 })
  const latest = useTransactions({ end: L.today, sort: 'date', dir: 'desc', limit: 6 })
  const days: Day[] = useMemo(() => {
    const entries = (week.data?.items ?? []).map((t) => ({ date: t.date, amount: t.amount, key: p[categoryLook(L.cat.get(t.category_id)).hue] }))
    return weekDays(start, L.today, entries).map((d, i) => ({
      date: d.date, letter: 'SMTWTFS'[i], today: d.date === L.today, total: d.total, future: d.future,
      parts: d.parts.map((x) => ({ color: x.key, cents: x.cents })),
      a11y: `${weekday(d.date)}, ${d.future ? 'still to come' : formatCents(d.total)}`,
    }))
  }, [week.data, start, L.today, L.cat, p])
  const weekTotal = days.reduce((n, d) => n + d.total, 0)

  // The rings: this month against what earlier months had spent by the same day, and in all (up to three full
  // months before this one). Rent on the 1st is in both, so the start of a month doesn't read as running ahead.
  const ym = monthOf(L.today)
  const earlier = useMemo(() => (L.b ? complete(L.b, [-3, -2, -1].map((n) => addMonths(ym, n)), L.today) : []), [L.b, ym, L.today])
  const history = useTransactions({ type: 'Spending', start: earlier[0], end: earlier.length ? lastOfMonth(earlier[earlier.length - 1]) : undefined, limit: 5000 }, earlier.length > 0)
  const ready = !earlier.length || !!history.data
  const usual = useMemo(() => (history.data ? usualBy(history.data.items, earlier, L.today) : null), [history.data, earlier, L.today])
  const spent = L.month?.spent ?? 0
  const ring = pace(spent, usual, L.today)
  const ringColor = ring.state === 'over' ? p.red : ring.state === 'ahead' ? p.orange : p.tint
  const legend = !ready ? ['', ''] : ring.usual && usual
    ? [spent > usual.whole ? `${whole(spent - usual.whole)} over a usual month` : `${Math.round(ring.outer * 100)}% of a usual month`, `Usually ${whole(usual.byNow)} by today`]
    : ['First month', `${Math.round(ring.inner * 100)}% of the month gone`]
  const waiting = bank?.waiting ?? 0
  const added = recent.data?.length ?? 0

  return (
    <>
      {HEADER}
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }}
        contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {gate.block ?? (L.b && !L.b.accounts.length ? (
          <Empty symbol="building.columns" title="No Accounts" body={bank ? 'Connect a bank in Settings.' : undefined} />
        ) : (
          <>
            {gate.note}
            {bank && (waiting > 0 || added > 0) && (
              <Card>
                <Row leading={<Tile symbol={waiting ? 'tray.full.fill' : 'checkmark'} color={waiting ? p.tint : p.green} />}
                  title="From Your Bank" chevron onPress={() => router.push('/check-in')}
                  subtitle={[waiting ? `${waiting} to review` : '', added ? `${added} added` : ''].filter(Boolean).join(' · ')} />
              </Card>
            )}

            <Card pad style={{ flexDirection: 'row', alignItems: 'center', gap: space.l, paddingVertical: space.xl }}>
              <View style={{ flex: 1, gap: space.xs }}>
                <Txt v="subhead" tone="label2" weight="600">Spent in {monthName(ym)}</Txt>
                <Rolling cents={spent} />
                <View style={{ gap: 3, marginTop: space.xs }}>
                  <Legend color={ringColor} text={legend[0]} />
                  <Legend color={p.indigo} text={legend[1]} />
                </View>
              </View>
              <View accessible accessibilityRole="image" accessibilityLabel={legend.filter(Boolean).join('. ')}>
                <Rings rings={ready ? [{ value: ring.outer, color: ringColor }, { value: ring.inner, color: p.indigo }] : [{ value: 0, color: ringColor }, { value: 0, color: p.indigo }]} />
              </View>
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

            <Section title="Latest" action={{ label: 'See All', onPress: () => router.navigate('/(tabs)/(activity)/activity') }} inset={70}>
              {(latest.data?.items ?? []).map((t) => <TxnRow key={t.id} t={t} showDate />)}
            </Section>
            {latest.data && !latest.data.items.length && <Empty symbol="list.bullet.rectangle" title="No Transactions Yet" />}
          </>
        ))}
      </ScrollView>
    </>
  )
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 18 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: text ? 1 : 0 }} />
      <Txt v="footnote" tone="label2" numberOfLines={1}>{text}</Txt>
    </View>
  )
}
