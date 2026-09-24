import { useMemo, type ReactNode } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { router, Stack } from 'expo-router'
import { useSharedValue } from 'react-native-reanimated'
import { Bar } from '@/components/Bar'
import { Chip } from '@/components/Chip'
import { Icon } from '@/components/Icon'
import { Mark } from '@/components/Mark'
import { Money } from '@/components/Money'
import { Hairline, Panel, Section } from '@/components/Panel'
import { Ring } from '@/components/Ring'
import { RollingMoney } from '@/components/Rolling'
import { ScrubChart } from '@/components/ScrubChart'
import { ScrubFigure } from '@/components/ScrubFigure'
import { StateView } from '@/components/StateView'
import { Button, Tap } from '@/components/Tap'
import { TxnRow } from '@/components/TxnRow'
import { Txt } from '@/components/Txt'
import { categoryVisual } from '@/icons/categories'
import type { Bootstrap, MonthRow } from '@/lib/api'
import { budgetFor, elapsed, paceOver } from '@/lib/budgets'
import { useTransactions } from '@/lib/data'
import { addDays, fromISO, monthLabel } from '@/lib/dates'
import { compactCents, formatCents, pct } from '@/lib/money'
import { monthsNow } from '@/lib/months'
import { usePace } from '@/lib/pace'
import { usePullRefresh } from '@/lib/refresh'
import { useTally } from '@/lib/tally'
import { space, font as ramp, useTheme } from '@/theme'

const DEFAULT_ORDER = ['networth', 'review', 'stats', 'quick', 'budgets', 'spending', 'ef', 'upcoming', 'recent', 'roth', 'chart']

/** Home layout from Settings (`home_layout`): saved order, new widgets joining at their default position. */
function layout(b: Bootstrap): string[] {
  let saved: { order?: string[]; hidden?: string[] } = {}
  try { saved = JSON.parse(b.settings.home_layout ?? '{}') } catch { /* default */ }
  const order = (saved.order ?? []).filter((id) => DEFAULT_ORDER.includes(id))
  DEFAULT_ORDER.forEach((id, i) => { if (!order.includes(id)) order.splice(Math.min(i, order.length), 0, id) })
  const hidden = new Set(saved.hidden ?? [])
  return order.filter((id) => !hidden.has(id))
}

const short = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const monthName = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'long' })

export default function Home() {
  const { q, b } = useTally()
  const pull = usePullRefresh(q.refetch)
  const { c } = useTheme()
  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="gearshape" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
        <Stack.Toolbar.Button icon="plus" accessibilityLabel="Add an entry" variant="prominent" tintColor={c.ink} onPress={() => router.push('/entry')} />
      </Stack.Toolbar>
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ padding: space.l, paddingBottom: 120 }}
        refreshControl={<RefreshControl {...pull} />}>
        {b ? <Widgets b={b} /> : <StateView q={q} />}
      </ScrollView>
    </>
  )
}

function Widgets({ b }: { b: Bootstrap }) {
  const ids = layout(b)
  const out: ReactNode[] = []
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    // Emergency fund and Roth are small; when they sit next to each other they share a row.
    if ((id === 'ef' && ids[i + 1] === 'roth') || (id === 'roth' && ids[i + 1] === 'ef')) {
      out.push(<View key="goals" style={{ flexDirection: 'row', gap: space.m, marginBottom: space.section - 4 }}><Goal b={b} kind={id} /><Goal b={b} kind={ids[i + 1] as 'ef' | 'roth'} /></View>)
      i++
      continue
    }
    const el = WIDGETS[id]?.(b)
    if (el) out.push(<View key={id}>{el}</View>) // each widget spaces itself; empty ones leave no gap
  }
  return <>{out}</>
}

const WIDGETS: Record<string, (b: Bootstrap) => ReactNode> = {
  networth: (b) => <NetWorth b={b} />,
  review: (b) => <MonthReview b={b} />,
  stats: (b) => <ThisMonth b={b} />,
  quick: (b) => (b.favorites.length ? <QuickAdd b={b} /> : null),
  budgets: (b) => <Budgets b={b} />,
  spending: (b) => <Spending b={b} />,
  ef: (b) => <Goal b={b} kind="ef" wide />,
  roth: (b) => <Goal b={b} kind="roth" wide />,
  upcoming: (b) => <Upcoming b={b} />,
  recent: (b) => <Recent b={b} />,
  chart: (b) => <NetWorthChart b={b} />,
}

function Delta({ cents, suffix }: { cents: number; suffix: string }) {
  const { c } = useTheme()
  const up = cents >= 0
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon sf={up ? 'arrow.up.right' : 'arrow.down.right'} md={up ? 'trending_up' : 'trending_down'} size={13} color={up ? c.pos : c.neg} weight="bold" />
      <Txt variant="callout" tone={up ? 'pos' : 'neg'} num style={{ fontWeight: '600' }}>{formatCents(Math.abs(cents))}</Txt>
      <Txt variant="callout" tone="label2">{suffix}</Txt>
    </View>
  )
}

function NetWorth({ b }: { b: Bootstrap }) {
  const { c } = useTheme()
  const { cur, prev } = monthsNow(b)
  if (!cur) return null
  return (
    <Tap href="/accounts" feedback="opacity" style={{ gap: 2, paddingHorizontal: space.xs, marginBottom: space.section - 4 }}>
        <Txt variant="sub" tone="label2" style={{ fontSize: 15 }}>Net worth</Txt>
        <RollingMoney cents={cur.net_worth} style={{ ...ramp.hero, color: c.label }} rollIn />
        {prev && <Delta cents={cur.net_worth - prev.net_worth} suffix={`since ${monthName(prev.month)}`} />}
    </Tap>
  )
}

/** The month panel: spending so far against last month's pace, day by day. The scrub moment on Home. */
function ThisMonth({ b }: { b: Bootstrap }) {
  const { c } = useTheme()
  const pace = usePace(b)
  const scrub = useSharedValue(-1)
  const { cur, prev } = monthsNow(b)
  const totalBudget = useMemo(() => {
    const vals = b.categories.filter((x) => x.type === 'Spending' && x.active).map((x) => budgetFor(b, x, cur?.month ?? ''))
    const set = vals.filter((v): v is number => v != null)
    return set.length ? set.reduce((a, v) => a + v, 0) : null
  }, [b, cur?.month])
  if (!cur) return null
  const spent = pace?.cur.at(-1) ?? cur.spent
  const prevAt = pace ? pace.prev[Math.max(0, (pace.cur.length || 1) - 1)] : null
  const diff = prevAt != null ? spent - prevAt : null
  const labels = pace ? pace.cur.map((_, i) => {
    const day = `${short(pace.month).split(' ')[0]} ${i + 1}`
    return prev ? `${day}, ${formatCents(pace.prev[i], { cents: false })} by then in ${monthName(prev.month)}` : day
  }) : []
  return (
    <Section title={monthName(cur.month)} href="/insights" action="Insights">
      <Panel style={{ gap: space.m }}>
        <ScrubFigure cents={spent} values={pace?.cur ?? []} labels={labels} scrub={scrub}
          style={{ ...ramp.title, color: c.label }}
          caption={diff != null && prev ? (
            <Txt variant="callout" tone="label2">
              <Txt variant="callout" tone={diff > 0 ? 'neg' : 'pos'} num style={{ fontWeight: '600' }}>{formatCents(Math.abs(diff), { cents: false })} {diff > 0 ? 'more' : 'less'}</Txt>
              {` than ${monthName(prev.month)} at this point`}
            </Txt>
          ) : <Txt variant="callout" tone="label2">Spent so far</Txt>} />
        {pace ? (
          <ScrubChart scrub={scrub} slots={pace.days} zero height={140} guide={totalBudget}
            series={[{ values: pace.cur, color: c.ink }, ...(prev ? [{ values: pace.prev, color: c.chartPrev, dashed: true }] : [])]} />
        ) : <View style={{ height: 140 }} />}
        <View style={{ flexDirection: 'row', gap: space.l, alignItems: 'center' }}>
          <Legend color={c.ink} label="This month" />
          {prev && <Legend color={c.chartPrev} label={monthName(prev.month)} dashed />}
          {totalBudget != null && <Legend color={c.label3} label={`Budget ${compactCents(totalBudget)}`} dashed />}
        </View>
        <Hairline />
        <View style={{ flexDirection: 'row' }}>
          <Stat label="Money in" cents={cur.money_in} tone="pos" />
          <Stat label="Left over" cents={cur.left_over} tone={cur.left_over < 0 ? 'neg' : undefined} />
          <Stat label="Scheduled" cents={pace?.scheduled ?? 0} />
        </View>
      </Panel>
    </Section>
  )
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 14, height: 0, borderTopWidth: 2, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }} />
      <Txt variant="foot" tone="label2">{label}</Txt>
    </View>
  )
}

function Stat({ label, cents, tone }: { label: string; cents: number; tone?: 'pos' | 'neg' }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt variant="sub" tone="label2">{label}</Txt>
      <Money cents={cents} whole tone={tone ?? 'neutral'} variant="headline" />
    </View>
  )
}

function QuickAdd({ b }: { b: Bootstrap }) {
  const { tint } = useTheme()
  const cats = new Map(b.categories.map((x) => [x.id, x]))
  return (
    <Section title="Quick add">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.l }}
        contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l }}>
        {b.favorites.map((f) => {
          const cat = cats.get(f.category_id)
          const v = cat ? categoryVisual({ ...cat, icon: f.icon ?? cat.icon, color: f.color ?? cat.color }) : null
          return (
            <Chip key={f.id} label={f.label}
              leading={v ? <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={28} /> : undefined}
              onPress={() => router.push({ pathname: '/entry', params: { fav: String(f.id) } })} />
          )
        })}
      </ScrollView>
    </Section>
  )
}

function Budgets({ b }: { b: Bootstrap }) {
  const { c, tint } = useTheme()
  const { cur } = monthsNow(b)
  if (!cur) return null
  const rows = b.categories.filter((x) => x.active && x.type === 'Spending')
    .map((x) => ({ x, budget: budgetFor(b, x, cur.month), spent: cur.by_category[String(x.id)] ?? 0 }))
    .filter((r) => r.budget != null && r.budget > 0) as { x: Bootstrap['categories'][number]; budget: number; spent: number }[]
  const notch = elapsed(cur.month, b.today)
  if (!rows.length) {
    return (
      <Section title="Budgets">
        <Panel style={{ alignItems: 'flex-start', gap: space.m }}>
          <View style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' }}>
              <Icon sf="gauge.with.needle" md="speed" size={20} color={c.label} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="headline">Give each category a limit</Txt>
              <Txt variant="sub" tone="label2">Tally suggests amounts from what you spent in recent months.</Txt>
            </View>
          </View>
          <Button label="Set budgets" href="/settings/budgets" />
        </Panel>
      </Section>
    )
  }
  rows.sort((a, z) => z.spent / z.budget - a.spent / a.budget)
  return (
    <Section title="Budgets" href="/settings/budgets" action="Edit">
      <Panel style={{ gap: space.l }}>
        {rows.slice(0, 5).map(({ x, budget, spent }) => {
          const v = categoryVisual(x)
          const over = spent > budget
          const warn = paceOver(spent, budget, cur.month, b.today)
          return (
            <Tap key={x.id} href={{ pathname: '/category/[id]', params: { id: String(x.id) } }} feedback="opacity" style={{ gap: space.s }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
                  <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={28} />
                  <Txt variant="row" style={{ flex: 1 }} numberOfLines={1}>{x.name}</Txt>
                  <Txt variant="sub" tone={over ? 'neg' : 'label2'} num>
                    {over ? `${formatCents(spent - budget, { cents: false })} over` : `${formatCents(budget - spent, { cents: false })} left`}
                  </Txt>
                </View>
                <Bar value={pct(spent, budget)} color={over ? c.neg : tint(v.tint)} notch={notch} />
                {warn != null && <Txt variant="foot" tone="warn">On pace to go {formatCents(warn, { cents: false })} over</Txt>}
            </Tap>
          )
        })}
      </Panel>
    </Section>
  )
}

function Spending({ b }: { b: Bootstrap }) {
  const { tint } = useTheme()
  const { cur } = monthsNow(b)
  if (!cur) return null
  const rows = b.categories.filter((x) => x.type === 'Spending')
    .map((x) => ({ x, spent: cur.by_category[String(x.id)] ?? 0 })).filter((r) => r.spent > 0)
    .sort((a, z) => z.spent - a.spent)
  if (!rows.length) return null
  const max = rows[0].spent
  return (
    <Section title="Where it went" href="/insights">
      <Panel pad={false} style={{ paddingVertical: space.xs }}>
        {rows.slice(0, 5).map(({ x, spent }, i) => {
          const v = categoryVisual(x)
          return (
            <View key={x.id}>
              {i > 0 && <Hairline inset={space.l + 40 + space.m} />}
              <Tap href={{ pathname: '/category/[id]', params: { id: String(x.id) } }} feedback="highlight" style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m }}>
                  <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Txt variant="row" numberOfLines={1} style={{ flexShrink: 1 }}>{x.name}</Txt>
                      <Money cents={spent} />
                    </View>
                    <Bar value={spent / max} color={tint(v.tint)} height={6} />
                  </View>
              </Tap>
            </View>
          )
        })}
      </Panel>
    </Section>
  )
}

function Goal({ b, kind, wide }: { b: Bootstrap; kind: 'ef' | 'roth'; wide?: boolean }) {
  const { c, tint } = useTheme()
  const ef = kind === 'ef'
  const have = ef ? b.ef.progress : b.roth.ytd
  const goal = ef ? b.ef.goal : b.roth.limit
  if (!goal) return null
  const color = ef ? tint('teal') : tint('violet')
  return (
    <Panel style={{ flex: 1, flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'flex-start', gap: space.m, marginBottom: wide ? space.section - 4 : 0 }}>
      <Ring value={pct(have, goal)} color={color} />
      <View style={{ gap: 2, flex: wide ? 1 : undefined }}>
        <Txt variant="sub" tone="label2">{ef ? 'Emergency fund' : `Roth IRA ${fromISO(b.today).getFullYear()}`}</Txt>
        <Money cents={have} whole variant="headline" />
        <Txt variant="foot" tone="label2" num>of {formatCents(goal, { cents: false })}{ef ? `, ${b.settings.ef_months ?? 6} months of spending` : ' limit'}</Txt>
      </View>
      {wide && <Icon sf="chevron.right" md="chevron_right" size={13} color={c.label3} />}
    </Panel>
  )
}

function Upcoming({ b }: { b: Bootstrap }) {
  const t = useTally()
  const q = useTransactions({ start: b.today, end: addDays(b.today, 30), sort: 'date', dir: 'asc', limit: 6 })
  const rows = (q.data?.items ?? []).filter((x) => x.date > b.today)
  if (!rows.length) return null
  return (
    <Section title="Coming up" href={{ pathname: '/activity', params: { when: 'upcoming' } }}>
      <Panel pad={false} style={{ paddingVertical: space.xs }}>
        {rows.slice(0, 4).map((x, i) => (
          <View key={x.id}>
            {i > 0 && <Hairline inset={space.l + 40 + space.m} />}
            <TxnRow t={x} c={t.catOf(x)} acct={t.acct} mark={t.markFor(x.what)} today={b.today} showDate={short(x.date)} />
          </View>
        ))}
      </Panel>
    </Section>
  )
}

function Recent({ b }: { b: Bootstrap }) {
  const t = useTally()
  const q = useTransactions({ end: b.today, limit: 5 })
  const rows = q.data?.items ?? []
  return (
    <Section title="Recent" href="/activity">
      <Panel pad={false} style={{ paddingVertical: space.xs }}>
        {rows.length === 0 && <Txt variant="callout" tone="label2" style={{ padding: space.l }}>{q.isLoading ? ' ' : 'Nothing logged yet. Tap + to add your first entry.'}</Txt>}
        {rows.map((x, i) => (
          <View key={x.id}>
            {i > 0 && <Hairline inset={space.l + 40 + space.m} />}
            <TxnRow t={x} c={t.catOf(x)} acct={t.acct} mark={t.markFor(x.what)} today={b.today}
              showDate={x.date === b.today ? t.catOf(x).name : `${short(x.date)}, ${t.catOf(x).name}`} />
          </View>
        ))}
      </Panel>
    </Section>
  )
}

/** Last month in one glance, for the first week of a new month. */
function MonthReview({ b }: { b: Bootstrap }) {
  const { c } = useTheme()
  const { prev } = monthsNow(b)
  if (!prev || fromISO(b.today).getDate() > 7) return null
  const top = Object.entries(prev.by_category).map(([id, v]) => ({ cat: b.categories.find((x) => String(x.id) === id), v }))
    .filter((r) => r.cat?.type === 'Spending' && r.v > 0).sort((a, z) => z.v - a.v)[0]
  return (
    <Section title={`${monthName(prev.month)} in review`}>
      <Panel style={{ gap: space.m }}>
        <View style={{ flexDirection: 'row' }}>
          <Stat label="Money in" cents={prev.money_in} tone="pos" />
          <Stat label="Spent" cents={prev.spent} />
          <Stat label="Left over" cents={prev.left_over} tone={prev.left_over < 0 ? 'neg' : undefined} />
        </View>
        {top?.cat && <Txt variant="callout" tone="label2">Most went to <Txt variant="callout" style={{ color: c.label, fontWeight: '600' }}>{top.cat.name}</Txt>, {formatCents(top.v, { cents: false })}.</Txt>}
      </Panel>
    </Section>
  )
}

function NetWorthChart({ b }: { b: Bootstrap }) {
  const { c } = useTheme()
  const scrub = useSharedValue(-1)
  const { upTo } = monthsNow(b)
  if (upTo.length < 3) return null
  const values = upTo.map((m: MonthRow) => m.net_worth)
  return (
    <Section title="Net worth over time">
      <Panel style={{ gap: space.m }}>
        <ScrubFigure cents={values.at(-1)!} values={values} labels={upTo.map((m) => `End of ${monthLabel(m.month, 'long')}`)} scrub={scrub}
          style={{ ...ramp.title, color: c.label }} caption={<Txt variant="callout" tone="label2">Month-end balances</Txt>} />
        <ScrubChart scrub={scrub} slots={values.length} series={[{ values, color: c.ink }]} height={120} />
      </Panel>
    </Section>
  )
}
