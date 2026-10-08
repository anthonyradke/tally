// Insights' recurring costs: what every bill and subscription adds up to a month and a year, as one bar split by
// template, with the biggest listed under it.
import { View } from 'react-native'
import { categoryVisual } from '@/icons/categories'
import type { Bootstrap } from '@/lib/api'
import { commitments } from '@/lib/commitments'
import { monthOf } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { useTally } from '@/lib/tally'
import { font as ramp, space, useTheme } from '@/theme'
import { Mark } from './Mark'
import { Money } from './Money'
import { Hairline, Panel, Section } from './Panel'
import { RollingMoney } from './Rolling'
import { Txt } from './Txt'

const FREQ = { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', yearly: 'Yearly' }

export function Commitments({ b }: { b: Bootstrap }) {
  const { c, tint } = useTheme()
  const t = useTally()
  const k = commitments(b)
  if (!k.out.length) return null
  const done = b.months.filter((m) => m.month < monthOf(b.today)).slice(-3)
  const income = done.length ? done.reduce((n, m) => n + m.money_in, 0) / done.length : 0
  const share = income > 0 ? k.outMonthly / income : null
  return (
    <Section title="Recurring costs" href="/settings/recurring" action="Edit">
      <Panel style={{ gap: space.m }}>
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <RollingMoney cents={k.outMonthly} whole style={{ ...ramp.title, color: c.label }} />
            <Txt variant="callout" tone="label2">a month</Txt>
          </View>
          <Txt variant="callout" tone="label2" num>
            {formatCents(k.outMonthly * 12, { cents: false })} a year{share != null ? `, about ${Math.max(1, Math.round(share * 100))}% of what usually comes in` : ''}.
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
          {k.out.map((x) => <View key={x.r.id} style={{ flex: x.monthly, backgroundColor: tint(categoryVisual(t.catOf(x.r)).tint) }} />)}
        </View>
        <View>
          {k.out.slice(0, 6).map((x, i) => {
            const v = categoryVisual(t.catOf(x.r))
            const mark = t.markFor(x.r.what || x.r.label)
            return (
              <View key={x.r.id}>
                {i > 0 && <Hairline inset={32 + space.m} />}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s }}>
                  {mark ? <Mark kind="spec" spec={mark} size={32} /> : <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={32} />}
                  <View style={{ flex: 1 }}>
                    <Txt variant="row" numberOfLines={1}>{x.r.label}</Txt>
                    <Txt variant="foot" tone="label2" num>{FREQ[x.r.freq]}{x.r.freq !== 'monthly' ? `, ${formatCents(x.r.amount)}` : ''}</Txt>
                  </View>
                  <Money cents={x.monthly} variant="callout" />
                </View>
              </View>
            )
          })}
          {k.out.length > 6 && <Txt variant="foot" tone="label2" style={{ paddingTop: space.xs }}>And {k.out.length - 6} more.</Txt>}
        </View>
      </Panel>
    </Section>
  )
}
