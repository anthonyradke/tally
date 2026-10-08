// One place: everything you've spent there (or received from it), how often, the usual category and account, month by
// month, and its entries. Its logo can be changed here: a brand, a colored letter, or the category's symbol.
import { useMemo } from 'react'
import { ScrollView, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useSharedValue } from 'react-native-reanimated'
import { closeSwipes } from '@/components/SwipeRow'
import { MarkPicker } from '@/components/MarkPicker'
import { Mark } from '@/components/Mark'
import { Hairline, Panel, Section } from '@/components/Panel'
import { ScrubChart } from '@/components/ScrubChart'
import { ScrubFigure } from '@/components/ScrubFigure'
import { StateView } from '@/components/StateView'
import { TxnRow } from '@/components/TxnRow'
import { Txt } from '@/components/Txt'
import { categoryVisual } from '@/icons/categories'
import { useAllTxns } from '@/lib/balances'
import { dayLabel, fromISO, monthLabel } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { place } from '@/lib/merchant'
import { useTally } from '@/lib/tally'
import { font as ramp, space, useTheme } from '@/theme'

const VERB: Record<string, string> = { 'Money in': 'Received from', Spending: 'Spent at', Transfer: 'Moved with', Saving: 'Saved with', Loan: 'Paid to' }

export default function Merchant() {
  const { key } = useLocalSearchParams<{ key: string }>()
  const { c, tint } = useTheme()
  const t = useTally()
  const all = useAllTxns(!!t.b)
  const scrub = useSharedValue(-1)
  const p = useMemo(() => (t.b && all.data ? place(t.b, key, all.data.items) : null), [t.b, all.data, key])
  const b = t.b
  if (!b || !p) {
    return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }}>
      {b && all.data ? <Txt variant="callout" tone="label2" style={{ padding: space.xl }}>Nothing logged here yet.</Txt> : <StateView q={all.data ? t.q : (all as never)} />}
    </ScrollView>
  }
  const cat = t.cat.get(p.categoryId)
  const v = cat ? categoryVisual(cat) : null
  const mark = t.markFor(p.name)
  const acct = p.accountId ? t.acct.get(p.accountId) : undefined
  const values = p.months.map((m) => m.cents)
  const since = fromISO(p.first).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return (
    <>
      <Stack.Screen options={{ title: p.name, headerLargeTitle: false }} />
      <ScrollView onScrollBeginDrag={closeSwipes} contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space.l, paddingBottom: 120 }}>
        <View style={{ gap: space.m, marginBottom: space.section - 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.xs }}>
            {mark ? <Mark kind="spec" spec={mark} size={56} /> : v ? <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={56} /> : null}
            <View style={{ flex: 1 }}>
              <Txt variant="sub" tone="label2" style={{ fontSize: 15 }}>{VERB[p.type] ?? 'At'} {p.name}</Txt>
              <ScrubFigure cents={p.total} values={values} labels={p.months.map((m) => `In ${monthLabel(m.month, 'long')}`)} scrub={scrub}
                style={{ ...ramp.title, color: c.label }} />
            </View>
          </View>
          <Panel style={{ flexDirection: 'row' }}>
            <Stat label={p.visits === 1 ? 'Time' : 'Times'} value={String(p.visits)} />
            <Stat label="Average" value={formatCents(p.average)} />
            <Stat label="Last" value={dayLabel(p.last, b.today)} />
          </Panel>
          {values.length > 1 && (
            <Panel style={{ gap: space.s }}>
              <ScrubChart scrub={scrub} slots={values.length} zero series={[{ values, color: v ? tint(v.tint) : c.ink }]} height={100} />
              <Txt variant="foot" tone="label2">Since {since}{cat ? `, usually ${cat.name}` : ''}{acct ? ` on ${acct.name}` : ''}.</Txt>
            </Panel>
          )}
        </View>
        <Section title="Entries" href={{ pathname: '/activity', params: { q: p.name } }}>
          <Panel pad={false}>
            {p.rows.slice(0, 20).map((x, i, rows) => (
              <View key={x.id}>
                {i > 0 && <Hairline inset={space.l + 40 + space.m} />}
                <TxnRow t={x} c={t.catOf(x)} acct={t.acct} mark={t.markFor(x.what)} today={b.today} showDate={`${dayLabel(x.date, b.today)}, ${t.catOf(x).name}`}
                  padTop={i === 0 ? space.xs : 0} padBottom={i === rows.length - 1 ? space.xs : 0} />
              </View>
            ))}
          </Panel>
        </Section>
        <MarkPicker what={p.name} merchant={p.key} />
      </ScrollView>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt variant="sub" tone="label2">{label}</Txt>
      <Txt variant="headline" num numberOfLines={1}>{value}</Txt>
    </View>
  )
}
