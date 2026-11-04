// Insights' trends: each spending category as a small card, its line over the months up to the one picked, and how
// that month compares with the average of the ones before it. Tapping a card opens the category.
import { View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { categoryVisual } from '@/icons/categories'
import type { Bootstrap, MonthRow } from '@/lib/api'
import { elapsed } from '@/lib/budgets'
import { useTypical } from '@/lib/typical'
import { formatCents } from '@/lib/money'
import { radius, space, useTheme } from '@/theme'
import { Mark } from './Mark'
import { Section } from './Panel'
import { Tap } from './Tap'
import { Txt } from './Txt'

const W = 120, H = 34

export function Trends({ b, months, at }: { b: Bootstrap; months: MonthRow[]; at: number }) {
  const { c, tint } = useTheme()
  const upTo = months.slice(Math.max(0, at - 5), at + 1)
  // A month still going is compared with what the months before had spent by the same day, not with a share of
  // their whole: rent paid on the 1st read +650% on the 4th.
  const share = upTo.length ? elapsed(upTo.at(-1)!.month, b.today) : 1
  const typical = useTypical(b, upTo.length - 1, share < 1)
  if (upTo.length < 3) return null
  const cards = b.categories.filter((x) => x.type === 'Spending')
    .map((x) => {
      const values = upTo.map((m) => Math.max(0, m.by_category[String(x.id)] ?? 0))
      const before = values.slice(0, -1)
      const whole = before.reduce((n, v) => n + v, 0) / before.length
      // Never against less than a pro-rata share of a usual month: a few days in, what's usual by then can be a few
      // dollars, and one grocery run read +1078%.
      const avg = share < 1 ? (typical ? Math.max(typical.by.get(x.id) ?? 0, whole * share) : null) : whole
      return { x, values, now: values.at(-1)!, avg }
    })
    .filter((r) => r.values.some((v) => v > 0))
    .sort((a, z) => z.now - a.now)
    .slice(0, 6)
  if (!cards.length) return null
  return (
    <Section title="Trends">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.m }}>
        {cards.map(({ x, values, now, avg }) => {
          const v = categoryVisual(x)
          const color = tint(v.tint)
          const change = avg != null && avg > 0 ? (now - avg) / avg : null
          const max = Math.max(...values, 1)
          const pts = values.map((val, i) => [4 + (i / (values.length - 1)) * (W - 8), 4 + (1 - val / max) * (H - 8)] as const)
          return (
            <Tap key={x.id} href={{ pathname: '/category/[id]', params: { id: String(x.id) } }}
              style={{ width: '47.5%', flexGrow: 1, padding: space.m, gap: space.s, borderRadius: radius.panel, borderCurve: 'continuous', backgroundColor: c.panel }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                <Mark kind="glyph" sf={v.sf} md={v.md} tint={color} size={24} />
                <Txt variant="sub" numberOfLines={1} style={{ flex: 1, fontWeight: '600' }}>{x.name}</Txt>
              </View>
              <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                <Path d={pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('')} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                {/* A month still going ends on an open dot: its low point is only so far. */}
                <Circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r={3} fill={share < 1 ? c.panel : color} stroke={color} strokeWidth={share < 1 ? 1.5 : 0} />
              </Svg>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Txt variant="headline" num>{formatCents(now, { cents: false })}</Txt>
                {change != null && Math.abs(change) >= 0.05 && (
                  <Txt variant="foot" num tone={change > 0 ? 'neg' : 'pos'} style={{ fontWeight: '600' }}>{change >= 1 ? `${(now / avg!).toFixed(1)}×` : `${change > 0 ? '+' : '−'}${Math.round(Math.abs(change) * 100)}%`}</Txt>
                )}
              </View>
            </Tap>
          )
        })}
      </View>
      <Txt variant="foot" tone="label2" style={{ paddingHorizontal: space.xs }}>{share < 1 ? 'Against the average of the months before it, by this point in the month.' : 'Against the average of the months before it.'}</Txt>
    </Section>
  )
}
