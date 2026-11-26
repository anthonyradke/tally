// Insights: spending or income over time, read like Health's trends. Pick a month (by day), six months, a year or
// everything; swipe the chart to page back in time; tap or press along the bars to read one. Underneath: a highlight
// in one sentence, and each category's share with how it changed from the period before. Averages and comparisons
// use full months only: a month still going, or the ledger's partial first one, would read low.
import { useMemo, useState } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api, type MonthRow, type TxnQuery } from '@/lib/api'
import { lastOfMonth, monthOf } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { useRefresh } from '@/design/feed'
import { useLedger } from '@/design/ledger'
import { categoryLook } from '@/design/look'
import { space, usePalette } from '@/design/theme'
import { before, byCategory, byCategoryOn, complete, counted, dayBars, highlight, monthBars, monthName, rangeLabel, window, type Metric, type Range } from '@/design/trends'
import { BarChart } from '@/design/ui/BarChart'
import { Card, Empty, Row, Section, Tile } from '@/design/ui/List'
import { loadGate } from '@/design/ui/LoadState'
import { Rolling } from '@/design/ui/Money'
import { Choice } from '@/design/ui/native/Choice'
import { Segmented } from '@/design/ui/native/Segmented'
import { SF } from '@/design/ui/SF'
import { Txt } from '@/design/ui/Txt'

const RANGES: [Range, string][] = [['M', 'M'], ['6M', '6M'], ['Y', 'Y'], ['All', 'All']]
const METRICS: [Metric, string][] = [['spent', 'Spending'], ['money_in', 'Income']]
const day = (iso: string) => Number(iso.slice(8, 10))

export default function Insights() {
  const p = usePalette()
  const L = useLedger()
  const gate = loadGate(L.q)
  const { refreshing, refresh } = useRefresh()
  const [range, setRange] = useState<Range>('6M')
  const [metric, setMetric] = useState<Metric>('spent')
  const [offset, setOffset] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const current = monthOf(L.today)
  const rows = useMemo(() => new Map((L.b?.months ?? []).map((m) => [m.month, m] as [string, MonthRow])), [L.b])
  const win = L.b ? window(L.b, current, range, offset) : { months: [current], older: false, newer: false }
  const type = metric === 'spent' ? 'Spending' : 'Money in'
  const month = win.months[0]
  // A month by day, posted entries only. No placeholder: the month or metric before would flash its shape.
  const dq: TxnQuery = { type, start: month, end: lastOfMonth(month) < L.today ? lastOfMonth(month) : L.today, limit: 2000 }
  const days = useQuery({ queryKey: ['transactions', dq], queryFn: () => api.transactions(dq), enabled: range === 'M' && month <= current })
  const entries = useMemo(() => days.data?.items ?? [], [days.data])

  const value = (m: MonthRow) => m[metric]
  const of = (m: string) => (rows.get(m) ? value(rows.get(m)!) : 0)
  const first = L.b ? monthOf(L.b.start) : current
  const bars = range === 'M' ? dayBars(month, entries, L.today) : monthBars(rows, win.months, value, range, current)
  const live = L.b ? counted(L.b, win.months, L.today) : []
  const full = L.b ? complete(L.b, win.months, L.today) : []
  const span = full.length ? full : live
  // M: the month's own figure (posted entries, refunds netted), and a dashed line at its daily average so far.
  const total = of(month)
  const gone = month === current ? day(L.today) : day(lastOfMonth(month))
  const average = range === 'M' ? (total > 0 && month <= current ? total / gone : undefined) : span.length ? span.reduce((n, m) => n + of(m), 0) / span.length : 0
  const color = metric === 'spent' ? p.orange : p.tint

  // Only a bar with something behind it can be picked: not one still to come or before the ledger.
  const pickable = (i: number) => range === 'M' ? !bars[i]?.future && month >= first : live.includes(win.months[i])
  const select = (i: number | null) => setPicked(i !== null && !pickable(i) ? null : i)
  const pickedMonth = picked !== null && range !== 'M' ? win.months[picked] : null
  const pickedDay = picked !== null && range === 'M' ? bars[picked]?.key ?? null : null
  const head = picked !== null
    ? { label: 'Total', figure: bars[picked]?.value ?? 0, sub: pickedDay ? `${monthName(month).split(' ')[0]} ${day(pickedDay)}` : monthName(win.months[picked]) }
    : range === 'M' ? { label: 'Total', figure: total, sub: rangeLabel(win.months, range) }
      // Named by the months it averages (whole ones), not the whole window, which can include ones still to come.
      : { label: 'Average', figure: Math.round(average ?? 0), sub: span.length === 1 ? monthName(span[0]) : span.length ? rangeLabel(span, '6M') : rangeLabel(win.months, range) }

  // The categories read the picked day or month, else the whole period. Changes compare its full months with as
  // many full months just before, inside the ledger; a day or a month still going has nothing to compare.
  const focus = pickedMonth ? [pickedMonth] : range === 'M' ? [month] : live
  const cmp = pickedDay ? [] : focus.filter((m) => full.includes(m))
  const comparable = cmp.length > 0 && before(cmp).every((m) => m >= first)
  const cats = (L.b?.categories ?? []).filter((c) => c.type === type)
  const now = pickedDay ? byCategoryOn(entries, pickedDay) : byCategory(rows, focus)
  const nowFull = byCategory(rows, cmp)
  const then = comparable ? byCategory(rows, before(cmp)) : new Map<number, number>()
  const list = cats.map((c) => ({ c, v: now.get(c.id) ?? 0, change: comparable ? changeText(nowFull.get(c.id) ?? 0, then.get(c.id) ?? 0) : null }))
    .filter((x) => x.v > 0).sort((a, b) => b.v - a.v)
  const sum = list.reduce((n, x) => n + x.v, 0)
  const footer = comparable && list.some((x) => x.change)
    ? cmp.length < focus.length
      ? `Changes compare the ${cmp.length === 1 ? 'full month' : `${cmp.length} full months`} with the ${cmp.length === 1 ? 'month' : `${cmp.length}`} before.`
      : `Changes compare with the ${cmp.length === 1 ? 'month' : `${cmp.length} months`} before.`
    : undefined

  // One sentence, the way Health words its highlights: a full month against the period's other full months.
  const h = range === 'M' ? null : highlight(rows, full, value, pickedMonth)
  const note = h && (() => {
    const what = metric === 'spent' ? 'spent' : 'earned'
    const when = `in ${monthName(h.month).split(' ')[0]}`
    if (Math.abs(h.diff) < 5) return { up: null, text: `You ${what} about your usual ${when}: ${formatCents(h.v, { cents: false })}.` }
    return { up: h.diff > 0, text: `You ${what} ${Math.abs(h.diff)}% ${h.diff > 0 ? 'more' : 'less'} ${when} than your average of ${formatCents(Math.round(h.avg), { cents: false })} a month.` }
  })()

  const go = (r: Range) => { setRange(r); setOffset(0); setPicked(null) }
  const open = (id: number) => {
    const at = pickedMonth ?? (range === 'M' ? month : undefined)
    router.push({ pathname: '/category/[id]', params: { id: String(id), range: range === 'M' ? '6M' : range, ...(at ? { month: at } : {}) } })
  }
  const empty = L.b && !L.b.months.some((m) => m.spent || m.money_in)
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }}
      contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {gate.block ?? (empty ? <Empty symbol="chart.bar" title="No History Yet" /> : (
        <>
          {gate.note}
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
              <BarChart bars={bars} color={color} average={average} selected={picked} onSelect={select}
                labelEvery={range === 'M' ? 7 : 1}
                onPage={(dir) => { if ((dir < 0 && win.older) || (dir > 0 && win.newer)) setOffset((o) => o + dir) }} />
            </Card>
          </View>

          {note && (
            <Card pad style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
              <SF name={note.up === null ? 'equal.circle.fill' : note.up ? 'arrow.up.circle.fill' : 'arrow.down.circle.fill'} size={28}
                color={note.up === null ? p.label2 : (note.up === (metric === 'spent')) ? p.orange : p.tint} />
              <Txt v="subhead" style={{ flex: 1 }}>{note.text}</Txt>
            </Card>
          )}

          {list.length > 0 && (
            <Section title="Categories" aside={formatCents(sum, { cents: false })} inset={62} footer={footer}>
              {list.map(({ c, v, change }) => {
                const look = categoryLook(c)
                return (
                  <View key={c.id}>
                    <Row leading={<Tile symbol={look.symbol} color={p[look.hue]} size={30} />} title={c.name}
                      subtitle={[`${Math.round((v / sum) * 100)}%`, change].filter(Boolean).join(' · ')}
                      value={formatCents(v, { cents: false })} valueTone="label" chevron onPress={() => open(c.id)} />
                    <View style={{ marginLeft: 62, marginRight: space.l, marginTop: -6, marginBottom: 10, height: 4, borderRadius: 2, backgroundColor: p.fill3, overflow: 'hidden' }}>
                      <View style={{ width: `${(v / (list[0]?.v || 1)) * 100}%`, height: 4, borderRadius: 2, backgroundColor: p[look.hue] }} />
                    </View>
                  </View>
                )
              })}
            </Section>
          )}
        </>
      ))}
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
