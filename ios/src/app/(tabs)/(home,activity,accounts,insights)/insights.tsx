import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Linking, RefreshControl, ScrollView, View } from 'react-native'
import { Stack } from 'expo-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Haptics from 'expo-haptics'
import { Bar } from '@/components/Bar'
import { Confetti } from '@/components/Confetti'
import { Donut } from '@/components/Donut'
import { EASE } from '@/components/ease'
import { Glow } from '@/components/Glow'
import { Icon } from '@/components/Icon'
import { Mark } from '@/components/Mark'
import { Money } from '@/components/Money'
import { Hairline, Panel, Section } from '@/components/Panel'
import { RollingMoney } from '@/components/Rolling'
import { Group, Row } from '@/components/Row'
import { ScrubChart } from '@/components/ScrubChart'
import { ScrubFigure } from '@/components/ScrubFigure'
import { Arrive, StateView } from '@/components/StateView'
import { Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { categoryVisual } from '@/icons/categories'
import { api, type Bootstrap, type MonthRow } from '@/lib/api'
import { budgetFor, elapsed } from '@/lib/budgets'
import { fromISO, monthLabel, monthOf } from '@/lib/dates'
import { compactCents, formatCents, pct } from '@/lib/money'
import { usePullRefresh } from '@/lib/refresh'
import { getServer } from '@/lib/server'
import { useTally } from '@/lib/tally'
import { font as ramp, radius, space, useTheme } from '@/theme'

const name = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'long' })
const shortName = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'short' })

export default function Insights() {
  const { q, b } = useTally()
  const pull = usePullRefresh(q.refetch)
  const { c } = useTheme()
  const [waited] = useState(!b) // the skeleton showed first
  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="square.and.arrow.up">
          <Stack.Toolbar.MenuAction icon="list.bullet.rectangle" onPress={() => Linking.openURL(`${getServer()}/export/log.csv`)}>Export every entry (CSV)</Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="calendar" onPress={() => Linking.openURL(`${getServer()}/export/months.csv`)}>Export months (CSV)</Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space.l, paddingBottom: 120 }}
        refreshControl={<RefreshControl {...pull} />}>
        <Glow />
        {b ? <Arrive on={waited}><Body b={b} /></Arrive> : <StateView q={q} />}
      </ScrollView>
    </>
  )
}

/** How far under its total budget a month's budgeted spending finished, or null (no budgets, or over). */
function underBy(b: Bootstrap, m: MonthRow): number | null {
  let budget = 0, spent = 0
  for (const x of b.categories) {
    if (x.type !== 'Spending') continue
    const cap = budgetFor(b, x, m.month)
    if (!cap) continue
    budget += cap
    spent += m.by_category[String(x.id)] ?? 0
  }
  return budget > 0 && spent <= budget ? budget - spent : null
}

const CELEBRATED = 'tally.celebrated'

/** A finished month that came in under budget: a badge, and confetti the first time you see it. */
function UnderBudget({ month, by }: { month: string; by: number }) {
  const { c } = useTheme()
  const [fire, setFire] = useState(0)
  useEffect(() => {
    let live = true
    AsyncStorage.getItem(CELEBRATED).then((v) => {
      const seen: string[] = v ? JSON.parse(v) : []
      if (!live || seen.includes(month)) return
      setFire((n) => n + 1)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      return AsyncStorage.setItem(CELEBRATED, JSON.stringify([...seen, month].slice(-36)))
    }).catch(() => {})
    return () => { live = false }
  }, [month])
  return (
    <View style={{ zIndex: 10, alignItems: 'center', marginTop: -space.s, marginBottom: space.l }}>
      <Animated.View entering={ZoomIn.springify().damping(14)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.m, height: 32,
        borderRadius: radius.pill, backgroundColor: c.panel }}>
        <Icon sf="sparkles" md="auto_awesome" size={14} color={c.pos} />
        <Txt variant="sub" tone="pos" num style={{ fontWeight: '700' }}>Under budget by {formatCents(by, { cents: false })}</Txt>
      </Animated.View>
      <Confetti fire={fire} origin={{ x: 0.5, y: 0.5 }} />
    </View>
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
  const settle = useMonthShift(m?.month)
  const cats = useMemo(() => !m ? [] : b.categories.filter((x) => x.type === 'Spending')
    .map((x) => ({ x, spent: m.by_category[String(x.id)] ?? 0, budget: budgetFor(b, x, m.month) }))
    .filter((r) => r.spent > 0 || (r.budget ?? 0) > 0).sort((a, z) => z.spent - a.spent), [b, m])
  if (!m) return null
  const go = (d: number) => { Haptics.selectionAsync().catch(() => {}); setSel(null); setI((k) => Math.max(0, Math.min(months.length - 1, k + d))) }
  const delta = prev ? m.spent - prev.spent : null
  const selected = cats.find((r) => String(r.x.id) === sel)
  const under = isNow ? null : underBy(b, m)
  // Early in a month, point back at last month if it came in under budget.
  const last = isNow && prev && Number(b.today.slice(8)) <= 10 ? underBy(b, prev) : null

  return (
    <>
      {/* Month switcher */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.l }}>
        <Tap feedback="opacity" onPress={() => go(-1)} disabled={i === 0} hitSlop={10} accessibilityLabel="Previous month" style={{ opacity: i === 0 ? 0.25 : 1, padding: space.s }}>
          <Icon sf="chevron.left" md="chevron_left" size={18} color={c.label} weight="bold" />
        </Tap>
        <Animated.View style={settle}>
          <Txt variant="headline" accessibilityRole="header">{monthLabel(m.month, 'long')}{isNow ? ', so far' : ''}</Txt>
        </Animated.View>
        <Tap feedback="opacity" onPress={() => go(1)} disabled={i === months.length - 1} hitSlop={10} accessibilityLabel="Next month" style={{ opacity: i === months.length - 1 ? 0.25 : 1, padding: space.s }}>
          <Icon sf="chevron.right" md="chevron_right" size={18} color={c.label} weight="bold" />
        </Tap>
      </View>

      {under != null && <UnderBudget month={m.month} by={under} />}
      {last != null && prev && (
        <Tap feedback="scale" onPress={() => go(-1)} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -space.s, marginBottom: space.l,
          paddingHorizontal: space.m, height: 32, borderRadius: radius.pill, backgroundColor: c.panel }}>
          <Icon sf="sparkles" md="auto_awesome" size={13} color={c.pos} />
          <Txt variant="sub" num>{name(prev.month)} came in {formatCents(last, { cents: false })} under budget</Txt>
          <Icon sf="chevron.left" md="chevron_left" size={11} color={c.label3} weight="bold" />
        </Tap>
      )}

      {/* Everything about the month eases in from the side it came from when you switch. */}
      <Animated.View style={settle}>
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
      </Animated.View>

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

/** Switching months: the month's content comes in a little from the side it came from, and brightens as it lands.
 *  Nothing on this screen shows the first time. */
function useMonthShift(month: string | undefined) {
  const reduce = useReducedMotion()
  const k = useSharedValue(1)
  const side = useSharedValue(0)
  const last = useRef(month)
  useLayoutEffect(() => {
    const was = last.current
    last.current = month
    if (!was || !month || was === month || reduce) return
    side.set(month > was ? 1 : -1)
    k.set(0)
    k.set(withTiming(1, { duration: 360, easing: EASE }))
  }, [month]) // eslint-disable-line react-hooks/exhaustive-deps
  return useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * k.get(), transform: [{ translateX: side.get() * 22 * (1 - k.get()) }] }))
}

function Stat({ label, cents, tone }: { label: string; cents: number; tone?: 'pos' | 'neg' }) {
  const { c } = useTheme()
  return (
    <View style={{ flex: 1, gap: 2, alignItems: 'center' }}>
      <Txt variant="sub" tone="label2">{label}</Txt>
      <RollingMoney cents={cents} whole style={{ ...ramp.headline, color: tone ? c[tone] : c.label }} />
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
                <Bars on={on} inH={Math.max(2, (m.money_in / max) * H)} outH={Math.max(2, (m.spent / max) * H)} h={H} />
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

/** One month's pair of bars; the picked month brightens and the one before fades back. */
function Bars({ on, inH, outH, h }: { on: boolean; inH: number; outH: number; h: number }) {
  const { c } = useTheme()
  const reduce = useReducedMotion()
  const o = useSharedValue(on ? 1 : 0.45)
  useEffect(() => { o.set(reduce ? (on ? 1 : 0.45) : withTiming(on ? 1 : 0.45, { duration: 240 })) }, [on, reduce, o])
  const style = useAnimatedStyle(() => ({ opacity: o.get() }))
  return (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: h }, style]}>
      <View style={{ width: 14, height: inH, borderRadius: 4, backgroundColor: c.pos }} />
      <View style={{ width: 14, height: outH, borderRadius: 4, backgroundColor: c.ink }} />
    </Animated.View>
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
  const q = useQuery({ queryKey: ['month-end', ym], queryFn: () => api.monthEnd(ym), placeholderData: keepPreviousData })
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

