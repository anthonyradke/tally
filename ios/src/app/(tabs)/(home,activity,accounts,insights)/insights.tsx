import { useMemo, useState } from 'react'
import { Linking, RefreshControl, ScrollView, View } from 'react-native'
import { router, Stack } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useSharedValue } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { Bar } from '@/components/Bar'
import { Donut } from '@/components/Donut'
import { Icon } from '@/components/Icon'
import { Mark } from '@/components/Mark'
import { Money } from '@/components/Money'
import { Hairline, Panel, Section } from '@/components/Panel'
import { RollingMoney } from '@/components/Rolling'
import { Group, Row } from '@/components/Row'
import { ScrubChart } from '@/components/ScrubChart'
import { ScrubFigure } from '@/components/ScrubFigure'
import { StateView } from '@/components/StateView'
import { Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { categoryVisual } from '@/icons/categories'
import { api, type Bootstrap } from '@/lib/api'
import { budgetFor, elapsed } from '@/lib/budgets'
import { fromISO, monthLabel, monthOf } from '@/lib/dates'
import { compactCents, formatCents, pct } from '@/lib/money'
import { usePullRefresh } from '@/lib/refresh'
import { getServer } from '@/lib/server'
import { useTally } from '@/lib/tally'
import { font as ramp, space, useTheme } from '@/theme'

const name = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'long' })
const shortName = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'short' })

export default function Insights() {
  const { q, b } = useTally()
  const pull = usePullRefresh(q.refetch)
  const { c } = useTheme()
  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="square.and.arrow.up">
          <Stack.Toolbar.MenuAction icon="list.bullet.rectangle" onPress={() => Linking.openURL(`${getServer()}/export/log.csv`)}>Export every entry (CSV)</Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="calendar" onPress={() => Linking.openURL(`${getServer()}/export/months.csv`)}>Export months (CSV)</Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Button icon="plus" accessibilityLabel="Add an entry" variant="prominent" tintColor={c.ink} onPress={() => router.push('/entry')} />
      </Stack.Toolbar>
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space.l, paddingBottom: 120 }}
        refreshControl={<RefreshControl {...pull} />}>
        {b ? <Body b={b} /> : <StateView q={q} />}
      </ScrollView>
    </>
  )
}

function Body({ b }: { b: Bootstrap }) {
  const { c, tint } = useTheme()
  const months = b.months.filter((m) => m.month <= monthOf(b.today))
  const [i, setI] = useState(months.length - 1)
  const [sel, setSel] = useState<string | null>(null)
  const m = months[i]
  const prev = months[i - 1]
  const isNow = m?.month === monthOf(b.today)
  const cats = useMemo(() => !m ? [] : b.categories.filter((x) => x.type === 'Spending')
    .map((x) => ({ x, spent: m.by_category[String(x.id)] ?? 0, budget: budgetFor(b, x, m.month) }))
    .filter((r) => r.spent > 0 || (r.budget ?? 0) > 0).sort((a, z) => z.spent - a.spent), [b, m])
  if (!m) return null
  const go = (d: number) => { Haptics.selectionAsync().catch(() => {}); setSel(null); setI((k) => Math.max(0, Math.min(months.length - 1, k + d))) }
  const delta = prev ? m.spent - prev.spent : null
  const selected = cats.find((r) => String(r.x.id) === sel)

  return (
    <>
      {/* Month switcher */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.l }}>
        <Tap feedback="opacity" onPress={() => go(-1)} disabled={i === 0} hitSlop={10} accessibilityLabel="Previous month" style={{ opacity: i === 0 ? 0.25 : 1, padding: space.s }}>
          <Icon sf="chevron.left" md="chevron_left" size={18} color={c.label} weight="bold" />
        </Tap>
        <Txt variant="headline" accessibilityRole="header">{monthLabel(m.month, 'long')}{isNow ? ', so far' : ''}</Txt>
        <Tap feedback="opacity" onPress={() => go(1)} disabled={i === months.length - 1} hitSlop={10} accessibilityLabel="Next month" style={{ opacity: i === months.length - 1 ? 0.25 : 1, padding: space.s }}>
          <Icon sf="chevron.right" md="chevron_right" size={18} color={c.label} weight="bold" />
        </Tap>
      </View>

      {/* Spending share */}
      <Panel style={{ alignItems: 'center', gap: space.l, marginBottom: space.section - 4, paddingVertical: space.xxl }}>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Donut key={m.month} slices={cats.filter((r) => r.spent > 0).map((r) => ({ key: String(r.x.id), value: r.spent, color: tint(categoryVisual(r.x).tint) }))} selected={sel} />
          <View style={{ position: 'absolute', alignItems: 'center', gap: 2 }} pointerEvents="none">
            <Txt variant="sub" tone="label2">{selected ? selected.x.name : 'Spent'}</Txt>
            <RollingMoney cents={selected ? selected.spent : m.spent} whole style={{ ...ramp.title2, fontSize: 26, color: c.label }} />
            {!selected && delta != null && prev && (
              <Txt variant="foot" tone={delta > 0 ? 'neg' : 'pos'} num>{delta > 0 ? '+' : '−'}{formatCents(Math.abs(delta), { cents: false })} vs {shortName(prev.month)}</Txt>
            )}
            {selected && <Txt variant="foot" tone="label2" num>{Math.round(pct(selected.spent, m.spent) * 100)}% of spending</Txt>}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignSelf: 'stretch' }}>
          <Stat label="Money in" cents={m.money_in} tone="pos" />
          <Stat label="Saved" cents={m.saving + m.loan} />
          <Stat label="Left over" cents={m.left_over} tone={m.left_over < 0 ? 'neg' : undefined} />
        </View>
      </Panel>

      {/* Categories, with budgets where set */}
      <Section title="Categories" href="/settings/budgets" action="Budgets">
        <Panel pad={false} style={{ paddingVertical: space.xs }}>
          {cats.length === 0 && <Txt variant="callout" tone="label2" style={{ padding: space.l }}>No spending in {name(m.month)}.</Txt>}
          {cats.map((r, k) => {
            const v = categoryVisual(r.x)
            const on = sel === String(r.x.id)
            const over = r.budget != null && r.spent > r.budget
            return (
              <View key={r.x.id}>
                {k > 0 && <Hairline inset={space.l + 40 + space.m} />}
                {/* Pressing a row lights its slice in the donut, then opens the category. */}
                <Tap feedback="highlight" href={{ pathname: '/category/[id]', params: { id: String(r.x.id) } }}
                  onPressIn={() => setSel(String(r.x.id))} onPressOut={() => setSel(null)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m, backgroundColor: on ? c.fill : undefined }}>
                  <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.s }}>
                      <Txt variant="row" numberOfLines={1} style={{ flexShrink: 1 }}>{r.x.name}</Txt>
                      <Money cents={r.spent} />
                    </View>
                    {r.budget != null ? (
                      <>
                        <Bar value={pct(r.spent, r.budget)} color={over ? c.neg : tint(v.tint)} notch={isNow ? elapsed(m.month, b.today) : undefined} height={6} />
                        <Txt variant="foot" tone={over ? 'neg' : 'label2'} num>{over ? `${formatCents(r.spent - r.budget, { cents: false })} over` : `${formatCents(r.budget - r.spent, { cents: false })} left`} of {formatCents(r.budget, { cents: false })}</Txt>
                      </>
                    ) : (
                      <Txt variant="foot" tone="label2" num>{Math.round(pct(r.spent, m.spent) * 100)}% of spending</Txt>
                    )}
                  </View>
                  <Icon sf="chevron.right" md="chevron_right" size={13} color={c.label3} weight="bold" />
                </Tap>
              </View>
            )
          })}
        </Panel>
      </Section>

      <CashFlow b={b} months={months} at={i} onPick={(k) => { setSel(null); setI(k) }} />
      <NetWorth b={b} />

      <Section title="Month end">
        <MonthEndRow month={m.month} />
      </Section>

      <Section title="Every month">
        <Panel pad={false}>
          <View style={{ flexDirection: 'row', paddingHorizontal: space.l, paddingVertical: space.s }}>
            {['Month', 'In', 'Spent', 'Left'].map((h, k) => <Txt key={h} variant="foot" tone="label2" style={{ flex: k === 0 ? 1.1 : 1, textAlign: k === 0 ? 'left' : 'right' }}>{h}</Txt>)}
          </View>
          {[...months].reverse().map((r) => (
            <View key={r.month}>
              <Hairline inset={space.l} />
              <View style={{ flexDirection: 'row', paddingHorizontal: space.l, paddingVertical: space.m }}>
                <Txt variant="callout" style={{ flex: 1.1 }}>{monthLabel(r.month)}</Txt>
                <Txt variant="callout" num tone="pos" style={{ flex: 1, textAlign: 'right' }}>{compactCents(r.money_in)}</Txt>
                <Txt variant="callout" num style={{ flex: 1, textAlign: 'right' }}>{compactCents(r.spent)}</Txt>
                <Txt variant="callout" num tone={r.left_over < 0 ? 'neg' : 'label'} style={{ flex: 1, textAlign: 'right' }}>{compactCents(r.left_over)}</Txt>
              </View>
            </View>
          ))}
        </Panel>
      </Section>
    </>
  )
}

function Stat({ label, cents, tone }: { label: string; cents: number; tone?: 'pos' | 'neg' }) {
  return (
    <View style={{ flex: 1, gap: 2, alignItems: 'center' }}>
      <Txt variant="sub" tone="label2">{label}</Txt>
      <Money cents={cents} whole tone={tone ?? 'neutral'} variant="headline" />
    </View>
  )
}

/** Money in against spending, month by month. Tapping a month selects it above. */
function CashFlow({ months, at, onPick }: { b: Bootstrap; months: Bootstrap['months']; at: number; onPick: (i: number) => void }) {
  const { c } = useTheme()
  const max = Math.max(1, ...months.flatMap((m) => [m.money_in, m.spent]))
  const H = 120
  return (
    <Section title="Cash flow">
      <Panel style={{ gap: space.m }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: H + 22, gap: space.l, justifyContent: 'center' }}>
          {months.slice(-6).map((m) => {
            const k = months.indexOf(m)
            const on = k === at
            return (
              <Tap key={m.month} feedback="opacity" onPress={() => onPick(k)} accessibilityLabel={`${monthLabel(m.month, 'long')}: in ${formatCents(m.money_in)}, spent ${formatCents(m.spent)}`}
                style={{ alignItems: 'center', gap: 6, flex: 1, maxWidth: 64 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: H, opacity: on ? 1 : 0.45 }}>
                  <View style={{ width: 14, height: Math.max(2, (m.money_in / max) * H), borderRadius: 4, backgroundColor: c.pos }} />
                  <View style={{ width: 14, height: Math.max(2, (m.spent / max) * H), borderRadius: 4, backgroundColor: c.ink }} />
                </View>
                <Txt variant="foot" tone={on ? 'label' : 'label2'} style={{ fontWeight: on ? '700' : '500' }}>{shortName(m.month)}</Txt>
              </Tap>
            )
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: space.l, justifyContent: 'center' }}>
          <Key color={c.pos} label="Money in" /><Key color={c.ink} label="Spent" />
        </View>
      </Panel>
    </Section>
  )
}

function Key({ color, label }: { color: string; label: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} /><Txt variant="foot" tone="label2">{label}</Txt></View>
}

function NetWorth({ b }: { b: Bootstrap }) {
  const { c } = useTheme()
  const scrub = useSharedValue(-1)
  const months = b.months.filter((m) => m.month <= b.today)
  if (months.length < 2) return null
  const values = months.map((m) => m.net_worth)
  return (
    <Section title="Net worth">
      <Panel style={{ gap: space.m }}>
        <ScrubFigure cents={values.at(-1)!} values={values} labels={months.map((m) => `End of ${monthLabel(m.month, 'long')}`)} scrub={scrub}
          style={{ ...ramp.title, color: c.label }} caption={<Txt variant="callout" tone="label2">Month-end, {months.length} months</Txt>} />
        <ScrubChart scrub={scrub} slots={values.length} series={[{ values, color: c.ink }]} height={110} />
      </Panel>
    </Section>
  )
}

function MonthEndRow({ month }: { month: string }) {
  const { c } = useTheme()
  const ym = month.slice(0, 7)
  const q = useQuery({ queryKey: ['month-end', ym], queryFn: () => api.monthEnd(ym) })
  const d = q.data
  const done = d ? [d.typed_done, d.interest_done, d.recon_done].filter(Boolean).length : 0
  return (
    <Group>
      <Row label="Month-end checklist" sub={d ? (done === 3 ? 'All done' : `${done} of 3 done: balances, interest, reconcile`) : 'Balances, interest and reconciling'}
        leading={<Icon sf={done === 3 ? 'checkmark.circle.fill' : 'circle.dashed'} md={done === 3 ? 'check_circle' : 'radio_button_unchecked'} size={22} color={done === 3 ? c.pos : c.label2} />}
        href={{ pathname: '/month-end', params: { month: ym } }} />
    </Group>
  )
}

