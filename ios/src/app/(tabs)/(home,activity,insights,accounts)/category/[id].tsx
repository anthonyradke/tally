// One category over time: its months as bars (six months, a year or everything, paged back by a swipe), the
// average, and its entries, newest first.
import { useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import type { MonthRow } from '@/lib/api'
import { useTransactions } from '@/lib/data'
import { monthOf } from '@/lib/dates'
import { useLedger } from '@/design/ledger'
import { categoryLook } from '@/design/look'
import { space, usePalette } from '@/design/theme'
import { counted, monthBars, monthName, rangeLabel, window, type Range } from '@/design/trends'
import { BarChart } from '@/design/ui/BarChart'
import { Card, Empty, Section } from '@/design/ui/List'
import { Rolling } from '@/design/ui/Money'
import { Segmented } from '@/design/ui/native/Segmented'
import { Txt } from '@/design/ui/Txt'
import { TxnRow } from '@/design/ui/TxnRow'

type Span = Exclude<Range, 'M'>
const RANGES: [Span, string][] = [['6M', '6M'], ['Y', 'Y'], ['All', 'All']]

export default function CategoryPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const cid = Number(id)
  const p = usePalette()
  const L = useLedger()
  const c = L.cat.get(cid)
  const [range, setRange] = useState<Span>('6M')
  const [offset, setOffset] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const rows = useMemo(() => new Map((L.b?.months ?? []).map((m) => [m.month, m] as [string, MonthRow])), [L.b])
  const list = useTransactions({ category: cid, sort: 'date', dir: 'desc', limit: 60 })
  if (!c || !L.b) return <Empty symbol="questionmark.circle" title="Category Not Found" />
  const look = categoryLook(c)
  const current = monthOf(L.today)
  const win = window(L.b, current, range, offset)
  const value = (m: MonthRow) => m.by_category[String(cid)] ?? 0
  const bars = monthBars(rows, win.months, value, range, current)
  const live = counted(L.b, win.months, L.today)
  const average = live.length ? live.reduce((n, m) => n + (rows.get(m) ? value(rows.get(m)!) : 0), 0) / live.length : 0
  return (
    <>
      <Stack.Screen options={{ title: c.name }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }}
        contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 120 }}>
        <View style={{ gap: space.l }}>
          <Segmented options={RANGES} value={range} onChange={(r) => { setRange(r); setOffset(0); setPicked(null) }} />
          <Card pad style={{ gap: space.l, paddingTop: space.xl }}>
            <View style={{ gap: 2 }}>
              <Txt v="footnote" tone="label2" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.2 }}>{picked !== null ? 'Total' : 'Average'}</Txt>
              <Rolling cents={picked !== null ? bars[picked]?.value ?? 0 : Math.round(average)} v="largeTitle" noCents />
              <Txt v="subhead" tone="label2">{picked !== null ? monthName(win.months[picked]) : rangeLabel(win.months, range)}</Txt>
            </View>
            <BarChart bars={bars} color={p[look.hue]} average={average} selected={picked} onSelect={setPicked}
              onPage={(dir) => { if ((dir < 0 && win.older) || (dir > 0 && win.newer)) setOffset((o) => o + dir) }} />
          </Card>
        </View>
        <Section title="Transactions" inset={70}>
          {(list.data?.items ?? []).map((t) => <TxnRow key={t.id} t={t} showDate />)}
        </Section>
        {list.data && !list.data.items.length && <Empty symbol="list.bullet.rectangle" title="No Transactions" />}
      </ScrollView>
    </>
  )
}
