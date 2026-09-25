import { useMemo } from 'react'
import { ScrollView, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useSharedValue } from 'react-native-reanimated'
import { closeSwipes } from '@/components/SwipeRow'
import { Icon } from '@/components/Icon'
import { Money } from '@/components/Money'
import { Hairline, Panel, Section } from '@/components/Panel'
import { ScrubChart } from '@/components/ScrubChart'
import { ScrubFigure } from '@/components/ScrubFigure'
import { StateView } from '@/components/StateView'
import { Tap } from '@/components/Tap'
import { TxnRow } from '@/components/TxnRow'
import { Txt } from '@/components/Txt'
import type { SFSymbol } from 'expo-symbols'
import { api } from '@/lib/api'
import { dailyBalances, useAllTxns } from '@/lib/balances'
import { dayLabel, fromISO, monthLabel, monthOf } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { useTally } from '@/lib/tally'
import { font as ramp, radius, space, useTheme } from '@/theme'

const short = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { c } = useTheme()
  const t = useTally()
  const all = useAllTxns(!!t.b)
  const recs = useQuery({ queryKey: ['reconciliations'], queryFn: api.reconciliations })
  const scrub = useSharedValue(-1)
  const a = t.acct.get(Number(id))
  const b = t.b

  const series = useMemo(() => {
    if (!a || !b) return null
    if ((a.kind === 'cash' || a.kind === 'card') && all.data) {
      const s = dailyBalances(a, all.data.items, b.start, b.today)
      return { values: s.values, labels: s.dates.map((d) => (d === b.today ? 'Today' : short(d))) }
    }
    const months = b.months.filter((m) => m.month <= b.today)
    return { values: months.map((m) => m.balances[String(a.id)] ?? a.start_balance), labels: months.map((m) => `End of ${monthLabel(m.month, 'long')}`) }
  }, [a, b, all.data])

  if (!a || !b) return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }}><StateView q={t.q} /></ScrollView>

  const owed = a.kind === 'card' || a.kind === 'loan'
  const now = series?.values.at(-1) ?? a.start_balance
  const monthStartIdx = series && (a.kind === 'cash' || a.kind === 'card') ? series.values.length - fromISO(b.today).getDate() : -1
  const startOfMonth = monthStartIdx > 0 && series ? series.values[monthStartIdx - 1] : null
  const change = startOfMonth != null ? now - startOfMonth : null
  const good = change != null && (owed ? change < 0 : change > 0)
  const rows = (all.data?.items ?? []).filter((x) => x.from_id === a.id || x.to_id === a.id).reverse()
  const mine = (recs.data ?? []).filter((r) => r.account_id === a.id).slice(0, 3)
  const inOut = rows.filter((x) => monthOf(x.date) === monthOf(b.today) && x.date <= b.today)
    .reduce((acc, x) => {
      const into = (x.to_id === a.id) !== owed // money into a cash account, or a payment onto a card
      if (into) acc.in += Math.abs(x.amount); else acc.out += Math.abs(x.amount)
      return acc
    }, { in: 0, out: 0 })

  return (
    <>
      <Stack.Screen options={{ title: a.name, headerLargeTitle: false }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="plus" accessibilityLabel="Add an entry" onPress={() => router.push({ pathname: '/new', params: { from: String(a.id) } })} />
      </Stack.Toolbar>
      <ScrollView onScrollBeginDrag={closeSwipes} contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space.l, paddingBottom: 120 }}>
        <View style={{ gap: space.m, marginBottom: space.section - 4 }}>
          <View style={{ paddingHorizontal: space.xs, gap: 2 }}>
            <Txt variant="sub" tone="label2" style={{ fontSize: 15 }}>{owed ? 'Balance owed' : a.kind === 'investment' ? 'Value' : 'Balance'}</Txt>
            <ScrubFigure cents={now} values={series?.values ?? []} labels={series?.labels ?? []} scrub={scrub}
              style={{ ...ramp.hero, color: c.label }}
              caption={change != null && change !== 0 ? (
                <Txt variant="callout" tone="label2"><Txt variant="callout" tone={good ? 'pos' : 'neg'} num style={{ fontWeight: '600' }}>{change > 0 ? '+' : '−'}{formatCents(Math.abs(change))}</Txt> this month</Txt>
              ) : <Txt variant="callout" tone="label2">{a.kind === 'investment' || a.kind === 'loan' ? 'As of the last month end' : 'As of today'}</Txt>} />
          </View>
          {series && series.values.length > 1 && (
            <ScrubChart scrub={scrub} slots={series.values.length} series={[{ values: series.values, color: c.ink }]} height={160} />
          )}
          <View style={{ flexDirection: 'row', gap: space.s }}>
            {(a.kind === 'cash' || a.kind === 'card') && (
              <Action sf="checkmark.seal" md="verified" label="Reconcile" onPress={() => router.push({ pathname: '/reconcile/[id]', params: { id: String(a.id) } })} />
            )}
            {(a.kind === 'investment' || a.kind === 'loan' || a.apy) && (
              <Action sf="calendar.badge.checkmark" md="event_available" label="Month end" onPress={() => router.push('/month-end')} />
            )}
            <Action sf="list.bullet" md="list" label="All entries" onPress={() => router.push({ pathname: '/activity', params: { account: String(a.id) } })} />
          </View>
        </View>

        {(a.kind === 'cash' || a.kind === 'card') && (
          <Section title={monthLabel(monthOf(b.today), 'long').split(' ')[0]}>
            <Panel style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="sub" tone="label2">{owed ? 'Paid off' : 'In'}</Txt>
                <Money cents={inOut.in} variant="headline" tone={owed ? 'neutral' : 'pos'} sign={owed ? 'auto' : 'always'} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="sub" tone="label2">{owed ? 'Charged' : 'Out'}</Txt>
                <Money cents={inOut.out} variant="headline" />
              </View>
            </Panel>
          </Section>
        )}

        {mine.length > 0 && (
          <Section title="Reconciled">
            <Panel pad={false}>
              {mine.map((r, i) => {
                const gap = r.actual - r.expected
                return (
                  <View key={r.id}>
                    {i > 0 && <Hairline inset={space.l} />}
                    <View style={{ flexDirection: 'row', alignItems: 'center', padding: space.l, gap: space.m }}>
                      <Icon sf={gap === 0 ? 'checkmark.circle.fill' : 'exclamationmark.circle'} md={gap === 0 ? 'check_circle' : 'error'} size={20} color={gap === 0 ? c.pos : c.warn} />
                      <Txt variant="body" style={{ flex: 1 }}>{dayLabel(r.date, b.today)}</Txt>
                      <Txt variant="callout" tone={gap === 0 ? 'label2' : 'warn'} num>{gap === 0 ? 'Matched' : `${formatCents(Math.abs(gap))} ${gap > 0 ? 'over' : 'under'}`}</Txt>
                    </View>
                  </View>
                )
              })}
            </Panel>
          </Section>
        )}

        <Section title="Entries" href={{ pathname: '/activity', params: { account: String(a.id) } }}>
          <Panel pad={false} style={{ paddingVertical: space.xs }}>
            {rows.length === 0 && <Txt variant="callout" tone="label2" style={{ padding: space.l }}>{all.isLoading ? ' ' : 'No entries touch this account yet.'}</Txt>}
            {rows.slice(0, 12).map((x, i) => (
              <View key={x.id}>
                {i > 0 && <Hairline inset={space.l + 40 + space.m} />}
                <TxnRow t={x} c={t.catOf(x)} acct={t.acct} mark={t.markFor(x.what)} today={b.today} showDate={`${dayLabel(x.date, b.today)}, ${t.catOf(x).name}`} />
              </View>
            ))}
          </Panel>
        </Section>
      </ScrollView>
    </>
  )
}

function Action({ sf, md, label, onPress }: { sf: SFSymbol; md: string; label: string; onPress: () => void }) {
  const { c } = useTheme()
  return (
    <Tap onPress={onPress} style={{ flex: 1, height: 64, borderRadius: radius.panel, backgroundColor: c.panel, alignItems: 'center', justifyContent: 'center', gap: 4, borderCurve: 'continuous' }}>
      <Icon sf={sf} md={md} size={19} color={c.label} />
      <Txt variant="foot">{label}</Txt>
    </Tap>
  )
}
