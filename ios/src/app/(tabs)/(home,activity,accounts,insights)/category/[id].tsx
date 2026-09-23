import { ScrollView, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useSharedValue } from 'react-native-reanimated'
import { Bar } from '@/components/Bar'
import { Mark } from '@/components/Mark'
import { Hairline, Panel, Section } from '@/components/Panel'
import { ScrubChart } from '@/components/ScrubChart'
import { ScrubFigure } from '@/components/ScrubFigure'
import { StateView } from '@/components/StateView'
import { TxnRow } from '@/components/TxnRow'
import { Txt } from '@/components/Txt'
import { categoryVisual } from '@/icons/categories'
import { budgetFor, elapsed, paceOver } from '@/lib/budgets'
import { useTransactions } from '@/lib/data'
import { dayLabel, fromISO, monthLabel, monthOf } from '@/lib/dates'
import { formatCents, pct } from '@/lib/money'
import { useTally } from '@/lib/tally'
import { font as ramp, space, useTheme } from '@/theme'

const monthName = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'long' })

export default function CategoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { c, tint } = useTheme()
  const t = useTally()
  const scrub = useSharedValue(-1)
  const x = t.cat.get(Number(id))
  const b = t.b
  const rows = useTransactions({ category: Number(id), limit: 40 }, !!x)
  if (!x || !b) return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }}><StateView q={t.q} /></ScrollView>
  const v = categoryVisual(x)
  const color = tint(v.tint)
  const months = b.months.filter((m) => m.month <= monthOf(b.today))
  const cur = months.at(-1)
  const values = months.map((m) => Math.abs(m.by_category[String(x.id)] ?? 0))
  const spent = cur ? cur.by_category[String(x.id)] ?? 0 : 0
  const budget = cur && x.type === 'Spending' ? budgetFor(b, x, cur.month) : null
  const avg = values.length > 1 ? Math.round(values.slice(0, -1).reduce((n, v2) => n + v2, 0) / (values.length - 1)) : null
  const warn = budget && cur ? paceOver(spent, budget, cur.month, b.today) : null
  const verb = x.type === 'Money in' ? 'Received' : x.type === 'Spending' ? 'Spent' : 'Moved'

  return (
    <>
      <Stack.Screen options={{ title: x.name, headerLargeTitle: false }} />
      {x.type === 'Spending' && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon="gauge.with.needle" accessibilityLabel="Set budget" onPress={() => router.push({ pathname: '/edit', params: { kind: 'budget', id: String(x.id) } })} />
        </Stack.Toolbar>
      )}
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space.l, paddingBottom: 120 }}>
        <View style={{ gap: space.m, marginBottom: space.section - 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.xs }}>
            <Mark kind="glyph" sf={v.sf} md={v.md} tint={color} size={44} />
            <View style={{ flex: 1 }}>
              <Txt variant="sub" tone="label2" style={{ fontSize: 15 }}>{verb} in {cur ? monthName(cur.month) : ''}</Txt>
              <ScrubFigure cents={Math.abs(spent)} values={values} labels={months.map((m) => `In ${monthLabel(m.month, 'long')}`)} scrub={scrub}
                style={{ ...ramp.title, color: c.label }} />
            </View>
          </View>
          {budget != null && (
            <Panel style={{ gap: space.s }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt variant="callout" tone={spent > budget ? 'neg' : 'label'} style={{ fontWeight: '600' }} num>
                  {spent > budget ? `${formatCents(spent - budget, { cents: false })} over` : `${formatCents(budget - spent, { cents: false })} left`}
                </Txt>
                <Txt variant="callout" tone="label2" num>of {formatCents(budget, { cents: false })}</Txt>
              </View>
              <Bar value={pct(spent, budget)} color={spent > budget ? c.neg : color} notch={cur ? elapsed(cur.month, b.today) : undefined} />
              {warn != null && <Txt variant="foot" tone="warn">On pace to go {formatCents(warn, { cents: false })} over</Txt>}
            </Panel>
          )}
          {values.length > 1 && (
            <Panel style={{ gap: space.s }}>
              <ScrubChart scrub={scrub} slots={values.length} zero series={[{ values, color }]} height={110} guide={budget} />
              {avg != null && <Txt variant="foot" tone="label2" num>Average before this month: {formatCents(avg, { cents: false })} a month</Txt>}
            </Panel>
          )}
        </View>
        <Section title="Entries" href={{ pathname: '/activity', params: { category: String(x.id) } }}>
          <Panel pad={false} style={{ paddingVertical: space.xs }}>
            {(rows.data?.items ?? []).length === 0 && <Txt variant="callout" tone="label2" style={{ padding: space.l }}>{rows.isLoading ? ' ' : `Nothing in ${x.name} yet.`}</Txt>}
            {(rows.data?.items ?? []).slice(0, 15).map((r, i) => (
              <View key={r.id}>
                {i > 0 && <Hairline inset={space.l + 40 + space.m} />}
                <TxnRow t={r} c={x} acct={t.acct} mark={t.markFor(r.what)} today={b.today} showDate={dayLabel(r.date, b.today)} />
              </View>
            ))}
          </Panel>
        </Section>
      </ScrollView>
    </>
  )
}
