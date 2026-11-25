// Insights: spending or income over time, read like Health's trends. Pick a month (by day), six months, a year or
// everything; swipe the chart to page back in time; tap or press along the bars to read one. Underneath: a highlight
// in one sentence, and each category's share with how it changed from the period before.
import { useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { useTransactions } from '@/lib/data'
import { lastOfMonth, monthOf } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import type { MonthRow } from '@/lib/api'
import { useLedger } from '@/design/ledger'
import { categoryLook } from '@/design/look'
import { space, usePalette } from '@/design/theme'
import { before, byCategory, counted, dayBars, monthBars, monthName, rangeLabel, window, type Metric, type Range } from '@/design/trends'
import { BarChart } from '@/design/ui/BarChart'
import { Card, Empty, Row, Section, Tile } from '@/design/ui/List'
import { Rolling } from '@/design/ui/Money'
import { Choice } from '@/design/ui/native/Choice'
import { Segmented } from '@/design/ui/native/Segmented'
import { SF } from '@/design/ui/SF'
import { Txt } from '@/design/ui/Txt'

const RANGES: [Range, string][] = [['M', 'M'], ['6M', '6M'], ['Y', 'Y'], ['All', 'All']]
const METRICS: [Metric, string][] = [['spent', 'Spending'], ['money_in', 'Income']]

export default function Insights() {
  const p = usePalette()
  const L = useLedger()
  const [range, setRange] = useState<Range>('6M')
  const [metric, setMetric] = useState<Metric>('spent')
  const [offset, setOffset] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const current = monthOf(L.today)
  const rows = useMemo(() => new Map((L.b?.months ?? []).map((m) => [m.month, m] as [string, MonthRow])), [L.b])
  const win = L.b ? window(L.b, current, range, offset) : { months: [current], older: false, newer: false }
  const type = metric === 'spent' ? 'Spending' : 'Money in'
  const month = win.months[0]
  const days = useTransactions({ type, start: month, end: lastOfMonth(month), limit: 2000 }, range === 'M')

  const value = (m: MonthRow) => m[metric]
  const bars = range === 'M' ? dayBars(month, days.data?.items ?? [], L.today) : monthBars(rows, win.months, value, range, current)
  const live = L.b ? counted(L.b, win.months, L.today) : []
  const total = bars.reduce((n, b) => n + b.value, 0)
  const average = range === 'M' ? undefined : live.length ? live.reduce((n, m) => n + (rows.get(m) ? value(rows.get(m)!) : 0), 0) / live.length : 0
  const color = metric === 'spent' ? p.orange : p.tint

  // What the header and the categories read: the picked bar's month, else the whole period.
  const focus = picked !== null && range !== 'M' ? [win.months[picked]] : range === 'M' ? win.months : live
  const head = picked !== null
    ? { label: 'Total', figure: bars[picked]?.value ?? 0, sub: range === 'M' ? `${monthName(month).split(' ')[0]} ${picked + 1}` : monthName(win.months[picked]) }
    : range === 'M' ? { label: 'Total', figure: total, sub: rangeLabel(win.months, range) }
      : { label: 'Average', figure: Math.round(average ?? 0), sub: rangeLabel(win.months, range) }

  const cats = (L.b?.categories ?? []).filter((c) => c.type === type)
  const now = byCategory(rows, focus)
  const then = byCategory(rows, before(focus))
  const list = cats.map((c) => ({ c, v: now.get(c.id) ?? 0, was: then.get(c.id) ?? 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v)
  const sum = list.reduce((n, x) => n + x.v, 0)

  // One sentence, the way Health words its highlights: the latest month against the period's usual.
  const highlight = (() => {
    if (range === 'M' || live.length < 2) return null
    const last = picked !== null ? win.months[picked] : live[live.length - 1]
    const others = live.filter((m) => m !== last)
    const avg = others.reduce((n, m) => n + (rows.get(m) ? value(rows.get(m)!) : 0), 0) / others.length
    const v = rows.get(last) ? value(rows.get(last)!) : 0
    if (!avg) return null
    const diff = Math.round(((v - avg) / avg) * 100)
    const what = metric === 'spent' ? 'spent' : 'earned'
    const when = last === current ? 'so far this month' : `in ${monthName(last).split(' ')[0]}`
    if (Math.abs(diff) < 5) return { up: null, text: `You ${what} about your usual ${when}: ${formatCents(v, { cents: false })}.` }
    return { up: diff > 0, text: `You ${what} ${Math.abs(diff)}% ${diff > 0 ? 'more' : 'less'} ${when} than your average of ${formatCents(Math.round(avg), { cents: false })} a month.` }
  })()

  const go = (r: Range) => { setRange(r); setOffset(0); setPicked(null) }
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }}
      contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 120 }}>
      {L.b && !L.b.months.length ? <Empty symbol="chart.bar" title="No History Yet" /> : (
        <>
          <View style={{ gap: space.l }}>
            <Segmented options={RANGES} value={range} onChange={go} />
            <Card pad style={{ gap: space.l, paddingTop: space.xl }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt v="footnote" tone="label2" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.2 }}>{head.label}</Txt>
                  <Rolling cents={head.figure} v="largeTitle" noCents />
                  <Txt v="subhead" tone="label2">{head.sub}</Txt>
                </View>
                <Choice options={METRICS} value={metric} onChange={(m) => { setMetric(m); setPicked(null) }} />
              </View>
              <BarChart bars={bars} color={color} average={average} selected={picked} onSelect={setPicked}
                labelEvery={range === 'M' ? 7 : 1}
                onPage={(dir) => { if ((dir < 0 && win.older) || (dir > 0 && win.newer)) setOffset((o) => o + dir) }} />
            </Card>
          </View>

          {highlight && (
            <Card pad style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
              <SF name={highlight.up === null ? 'equal.circle.fill' : highlight.up ? 'arrow.up.circle.fill' : 'arrow.down.circle.fill'} size={28}
                color={highlight.up === null ? p.label2 : (highlight.up === (metric === 'spent')) ? p.orange : p.tint} />
              <Txt v="subhead" style={{ flex: 1 }}>{highlight.text}</Txt>
            </Card>
          )}

          {list.length > 0 && (
            <Section title="Categories" aside={formatCents(sum, { cents: false })} inset={62}
              footer={focus.length ? `Changes compare with the ${focus.length === 1 ? 'month' : `${focus.length} months`} before.` : undefined}>
              {list.map(({ c, v, was }) => {
                const look = categoryLook(c)
                return (
                  <View key={c.id}>
                    <Row leading={<Tile symbol={look.symbol} color={p[look.hue]} size={30} />} title={c.name}
                      subtitle={[`${Math.round((v / sum) * 100)}%`, changeText(v, was)].filter(Boolean).join(' · ')}
                      value={formatCents(v, { cents: false })} valueTone="label" chevron
                      onPress={() => router.push({ pathname: '/category/[id]', params: { id: String(c.id) } })} />
                    <View style={{ marginLeft: 62, marginRight: space.l, marginTop: -6, marginBottom: 10, height: 4, borderRadius: 2, backgroundColor: p.fill3, overflow: 'hidden' }}>
                      <View style={{ width: `${(v / (list[0]?.v || 1)) * 100}%`, height: 4, borderRadius: 2, backgroundColor: p[look.hue] }} />
                    </View>
                  </View>
                )
              })}
            </Section>
          )}
        </>
      )}
    </ScrollView>
  )
}

/** "▲ 12%", or for a big jump "▲ 4.1×", against the period before; nothing when there's nothing to compare. */
function changeText(v: number, was: number): string | null {
  if (was <= 0) return null
  const ratio = v / was
  if (ratio >= 2) return `▲ ${ratio.toFixed(1)}×`
  const pctChange = Math.round((ratio - 1) * 100)
  return pctChange === 0 ? 'Same' : `${pctChange > 0 ? '▲' : '▼'} ${Math.abs(pctChange)}%`
}

