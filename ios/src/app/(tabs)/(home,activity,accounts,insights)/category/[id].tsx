import { useMemo } from 'react'
import { ScrollView, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useSharedValue } from 'react-native-reanimated'
import { closeSwipes } from '@/components/SwipeRow'
import { Bar } from '@/components/Bar'
import { Mark } from '@/components/Mark'
import { Hairline, Panel, Section } from '@/components/Panel'
import { ScrubChart } from '@/components/ScrubChart'
import { ScrubFigure } from '@/components/ScrubFigure'
import { StateView } from '@/components/StateView'
import { TxnRow } from '@/components/TxnRow'
import { Txt } from '@/components/Txt'
import { categoryVisual } from '@/icons/categories'
import { budgetFor, elapsed, paceOver, paidBill, USUAL_MONTHS, usualBefore, usualFor, vsUsual } from '@/lib/budgets'
import { useTransactions } from '@/lib/data'
import { dayLabel, fromISO, lastOfMonth, monthLabel, monthOf } from '@/lib/dates'
import { formatCents, pct } from '@/lib/money'
import { ledgerMonth, monthChart } from '@/lib/months'
import { useTally } from '@/lib/tally'
import { useAllTxns } from '@/lib/balances'
import { placesIn } from '@/lib/merchant'
import { useTypical } from '@/lib/typical'
import { Money } from '@/components/Money'
import { Tap } from '@/components/Tap'
import { font as ramp, space, useTheme } from '@/theme'

const monthName = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'long' })

/** A category's page. `month` (YYYY-MM, from Insights or Trends) opens it on that month: its figure, budget, places and
 *  entries. Without it, the page shows this month, the last few entries and places of all time. */
export default function CategoryDetail() {
  const { id, month: asked } = useLocalSearchParams<{ id: string; month?: string }>()
  const { c, tint } = useTheme()
  const t = useTally()
  const scrub = useSharedValue(-1)
  const x = t.cat.get(Number(id))
  const b = t.b
  // Only a month the ledger has: anything else opens on this month, as if none was passed.
  const scoped = b ? ledgerMonth(b, asked) : null
  const rows = useTransactions({ category: Number(id), limit: 40, ...(scoped ? { start: scoped, end: lastOfMonth(scoped) } : {}) }, !!x)
  const all = useAllTxns(!!x)
  const typical = useTypical(b, USUAL_MONTHS, x?.type === 'Spending')
  // Kept between renders: the full list arriving right after the page opens re-rendered it, and a new toolbar
  // rebuilt "Set budget" under a tap (lib/nav).
  const header = useMemo(() => x && (
    <>
      <Stack.Screen options={{ title: x.name, headerLargeTitle: false }} />
      <Stack.Toolbar placement="right">
        {[
          ...(x.type === 'Spending' ? [<Stack.Toolbar.Button key="budget" icon="gauge.with.needle" accessibilityLabel="Set budget"
            onPress={() => router.push({ pathname: '/edit', params: { kind: 'budget', id: String(x.id) } })} />] : []),
          <Stack.Toolbar.Button key="edit" onPress={() => router.push({ pathname: '/edit', params: { kind: 'category', id: String(x.id) } })}>Edit</Stack.Toolbar.Button>,
        ]}
      </Stack.Toolbar>
    </>
  ), [x?.id, x?.name, x?.type]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!x || !b) return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }}><StateView q={t.q} /></ScrollView>
  const v = categoryVisual(x)
  const color = tint(v.tint)
  const { months, k, live } = monthChart(b, scoped)
  const at = months[k] // the month on show
  const values = months.map((m) => Math.abs(m.by_category[String(x.id)] ?? 0))
  const spent = at ? at.by_category[String(x.id)] ?? 0 : 0
  const budget = at && x.type === 'Spending' ? budgetFor(b, x, at.month) : null
  // The same months Trends averages, so its card and this page agree on the change.
  const usual = usualBefore(values, k)
  const avg = usual != null ? Math.round(usual) : null
  const partial = !!at && elapsed(at.month, b.today) < 1
  const usualNow = typical && x.type === 'Spending' ? Math.round(typical.by.get(x.id) ?? 0) : null
  const warn = budget && at ? paceOver(spent, budget, at.month, b.today, usualFor(typical, x.id)) : null
  const paid = budget != null && paidBill(b, x.id, spent, budget)
  // Places for the month on show when one was asked for, else of all time; either way the title says which.
  const inView = all.data && scoped ? all.data.items.filter((r) => r.date >= scoped && r.date <= lastOfMonth(scoped)) : all.data?.items
  const places = inView ? placesIn(b, x.id, inView) : []
  const verb = x.type === 'Money in' ? 'Received' : x.type === 'Spending' ? 'Spent' : 'Moved'
  const name = at ? monthName(at.month) : ''
  const list = rows.data?.items ?? []

  return (
    <>
      {header}
      <ScrollView onScrollBeginDrag={closeSwipes} contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space.l, paddingBottom: 120 }}>
        <View style={{ gap: space.m, marginBottom: space.section - 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.xs }}>
            <Mark kind="glyph" sf={v.sf} md={v.md} tint={color} size={44} />
            <View style={{ flex: 1 }}>
              <Txt variant="sub" tone="label2" style={{ fontSize: 15 }}>{verb} in {name}{partial ? ' so far' : ''}</Txt>
              <ScrubFigure cents={Math.abs(spent)} values={values} labels={months.map((m) => `In ${monthLabel(m.month, 'long')}${m.month === monthOf(b.today) && elapsed(m.month, b.today) < 1 ? ' so far' : ''}`)} scrub={scrub}
                style={{ ...ramp.title, color: c.label }} />
            </View>
          </View>
          {budget != null && (
            <Panel style={{ gap: space.s }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt variant="callout" tone={spent > budget && !paid ? 'neg' : 'label'} style={{ fontWeight: '600' }} num>
                  {paid ? 'Paid' : spent > budget ? `${formatCents(spent - budget, { cents: false })} over` : `${formatCents(budget - spent, { cents: false })} left`}
                </Txt>
                <Txt variant="callout" tone="label2" num>of {formatCents(budget, { cents: false })}</Txt>
              </View>
              <Bar value={pct(spent, budget)} color={spent > budget && !paid ? c.neg : color} notch={partial && at ? elapsed(at.month, b.today) : undefined} />
              {warn != null && <Txt variant="foot" tone="warn">On pace to go {formatCents(warn, { cents: false })} over</Txt>}
            </Panel>
          )}
          {values.length > 1 && (
            <Panel style={{ gap: space.s }}>
              {/* The chart rests on the month on show, the months after it dimmed. This month, still going, nearly always
                  sits low: its dot breathes, and the line under the chart says what's usual by now. */}
              <ScrubChart scrub={scrub} slots={values.length} zero series={[{ values, color }]} height={110} guide={budget} at={k} live={live} />
              {avg != null && <Txt variant="foot" tone="label2" num>{usualLine(name, k > USUAL_MONTHS, avg, vsUsual(Math.abs(spent), usual), partial, usualNow)}</Txt>}
            </Panel>
          )}
        </View>
        {places.length > 1 && (
          <Section title={scoped ? `Places in ${name}` : 'Places, all time'}>
            <Panel pad={false}>
              {places.map((p, i) => {
                const mark = t.markFor(p.name)
                return (
                  <View key={p.key}>
                    {i > 0 && <Hairline inset={space.l + 32 + space.m} />}
                    <Tap feedback="highlight" href={{ pathname: '/merchant/[key]', params: { key: p.key } }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l,
                        paddingTop: space.m + (i === 0 ? space.xs : 0), paddingBottom: space.m + (i === places.length - 1 ? space.xs : 0) }}>
                      {mark ? <Mark kind="spec" spec={mark} size={32} /> : <Mark kind="glyph" sf={v.sf} md={v.md} tint={color} size={32} />}
                      <View style={{ flex: 1 }}>
                        <Txt variant="row" numberOfLines={1}>{p.name}</Txt>
                        <Txt variant="foot" tone="label2">{p.visits === 1 ? 'Once' : `${p.visits} times`}</Txt>
                      </View>
                      <Money cents={p.cents} variant="callout" />
                    </Tap>
                  </View>
                )
              })}
            </Panel>
          </Section>
        )}
        <Section title={scoped ? `Entries in ${name}` : 'Entries'}
          href={{ pathname: '/activity', params: { category: String(x.id), ...(scoped ? { month: scoped.slice(0, 7) } : {}) } }}>
          <Panel pad={false}>
            {list.length === 0 && <Txt variant="callout" tone="label2" style={{ padding: space.l }}>{rows.isLoading ? ' ' : scoped ? `Nothing in ${x.name} in ${name}.` : `Nothing in ${x.name} yet.`}</Txt>}
            {list.slice(0, 15).map((r, i, shown) => (
              <View key={r.id}>
                {i > 0 && <Hairline inset={space.l + 40 + space.m} />}
                <TxnRow t={r} c={x} acct={t.acct} mark={t.markFor(r.what)} today={b.today} showDate={dayLabel(r.date, b.today)}
                  padTop={i === 0 ? space.xs : 0} padBottom={i === shown.length - 1 ? space.xs : 0} />
              </View>
            ))}
          </Panel>
        </Section>
      </ScrollView>
    </>
  )
}

/** The line under the chart: the month on show against the average of the months before it. A month still going
 *  also says what's usual by this day; a finished one says how it compared. */
function usualLine(name: string, windowed: boolean, avg: number, change: number | null, partial: boolean, usualNow: number | null): string {
  const base = `${windowed ? `Average of the ${USUAL_MONTHS} months before ${name}` : `Average before ${name}`}: ${formatCents(avg, { cents: false })} a month`
  if (partial) return usualNow != null ? `${base}, ${formatCents(usualNow, { cents: false })} by this day` : base
  if (change == null) return base
  const p = Math.round(Math.abs(change) * 100)
  return `${base}. ${name} came in ${change === 0 ? 'about the same' : `${p.toLocaleString('en-US')}% ${change > 0 ? 'higher' : 'lower'}`}.`
}
