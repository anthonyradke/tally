// One category over time: its months as bars (six months, a year or everything, paged back by a swipe), the
// average of its full months, and its entries, newest first; picking a month narrows them to it. Opened from
// Insights, it starts on the month that was being read there.
import { useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import type { MonthRow } from '@/lib/api'
import { lastOfMonth, monthOf } from '@/lib/dates'
import { useLedger } from '@/design/ledger'
import { categoryLook } from '@/design/look'
import { space, usePalette } from '@/design/theme'
import { averaged, counted, locate, monthBars, monthName, rangeLabel, window, type Range } from '@/design/trends'
import { BarChart } from '@/design/ui/BarChart'
import { EntryList } from '@/design/ui/EntryList'
import { Card, Empty } from '@/design/ui/List'
import { loadGate } from '@/design/ui/LoadState'
import { Rolling } from '@/design/ui/Money'
import { Segmented } from '@/design/ui/native/Segmented'
import { Txt } from '@/design/ui/Txt'

type Span = Exclude<Range, 'M'>
const RANGES: [Span, string][] = [['6M', '6M'], ['Y', 'Y'], ['All', 'All']]
const isSpan = (r: string | undefined): r is Span => r === '6M' || r === 'Y' || r === 'All'

export default function CategoryPage() {
  const params = useLocalSearchParams<{ id: string; month?: string; range?: string }>()
  const cid = Number(params.id)
  const p = usePalette()
  const L = useLedger()
  const gate = loadGate(L.q)
  const c = L.cat.get(cid)
  const current = monthOf(L.today)
  const [start] = useState(() => {
    const range: Span = isSpan(params.range) ? params.range : '6M'
    const at = params.month ? locate(current, params.month, range, L.b?.start ?? params.month) : null
    return { range, offset: at?.offset ?? 0, index: at?.index ?? null }
  })
  const [range, setRange] = useState<Span>(start.range)
  const [offset, setOffset] = useState(start.offset)
  const [picked, setPicked] = useState<number | null>(start.index)
  const rows = useMemo(() => new Map((L.b?.months ?? []).map((m) => [m.month, m] as [string, MonthRow])), [L.b])
  if (gate.block) return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }}>{gate.block}</ScrollView>
  if (!c || !L.b) return <Empty symbol="questionmark.circle" title="Category Not Found" />
  const look = categoryLook(c)
  const win = window(L.b, current, range, offset)
  const value = (m: MonthRow) => m.by_category[String(cid)] ?? 0
  const bars = monthBars(rows, win.months, value, range, current)
  const live = counted(L.b, win.months, L.today)
  const span = averaged(L.b, win.months, L.today)
  const average = span.length ? span.reduce((n, m) => n + (rows.get(m) ? value(rows.get(m)!) : 0), 0) / span.length : 0
  // Only a month with something behind it can be picked: not one still to come or before the ledger.
  const month = picked !== null && live.includes(win.months[picked]) ? win.months[picked] : null

  const header = (
    <View style={{ gap: space.l }}>
      {gate.note}
      <Segmented options={RANGES} value={range} onChange={(r) => { setRange(r); setOffset(0); setPicked(null) }} />
      <Card pad style={{ gap: space.l, paddingTop: space.xl }}>
        <View style={{ gap: 2 }}>
          <Txt v="footnote" tone="label2" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.2 }}>{month ? 'Total' : 'Average'}</Txt>
          <Rolling cents={month ? bars[picked!]?.value ?? 0 : Math.round(average)} v="largeTitle" noCents />
          <Txt v="subhead" tone="label2">{month ? monthName(month) : rangeLabel(win.months, range)}</Txt>
        </View>
        <BarChart bars={bars} color={p[look.hue]} average={average} selected={month ? picked : null}
          onSelect={(i) => setPicked(i !== null && live.includes(win.months[i]) ? i : null)}
          onPage={(dir) => { if ((dir < 0 && win.older) || (dir > 0 && win.newer)) setOffset((o) => o + dir) }} />
      </Card>
    </View>
  )
  return (
    <>
      <Stack.Screen options={{ title: c.name }} />
      <EntryList header={header} aside={month ? monthName(month).split(' ')[0] : undefined}
        query={{ category: cid, ...(month ? { start: month, end: lastOfMonth(month) } : {}) }}
        scheduled={!month || month === current} />
    </>
  )
}
