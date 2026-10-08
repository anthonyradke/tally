// Insights' top places for a month: where the most went, by name, each opening that place's page.
import { View } from 'react-native'
import type { Bootstrap } from '@/lib/api'
import { useTransactions } from '@/lib/data'
import { lastOfMonth } from '@/lib/dates'
import { topPlaces } from '@/lib/merchant'
import { useTally } from '@/lib/tally'
import { categoryVisual } from '@/icons/categories'
import { space, useTheme } from '@/theme'
import { Icon } from './Icon'
import { Mark } from './Mark'
import { Money } from './Money'
import { Hairline, Panel, Section } from './Panel'
import { Tap } from './Tap'
import { Txt } from './Txt'

export function TopPlaces({ b, month }: { b: Bootstrap; month: string }) {
  const { c, tint } = useTheme()
  const t = useTally()
  const end = lastOfMonth(month)
  const q = useTransactions({ type: 'Spending', start: month, end, limit: 3000 })
  const list = q.data ? topPlaces(b, month, end, q.data.items) : []
  if (!list.length) return null
  return (
    <Section title="Top places">
      <Panel pad={false}>
        {list.map((x, i) => {
          const mark = t.markFor(x.name)
          const row = q.data!.items.find((r) => r.what === x.name)
          const v = row ? categoryVisual(t.catOf(row)) : null
          return (
            <View key={x.key}>
              {i > 0 && <Hairline inset={space.l + 40 + space.m} />}
              <Tap feedback="highlight" href={{ pathname: '/merchant/[key]', params: { key: x.key } }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l,
                  paddingTop: space.m + (i === 0 ? space.xs : 0), paddingBottom: space.m + (i === list.length - 1 ? space.xs : 0) }}>
                {mark ? <Mark kind="spec" spec={mark} /> : v ? <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} /> : null}
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="row" numberOfLines={1}>{x.name}</Txt>
                  <Txt variant="sub" tone="label2">{x.visits === 1 ? 'Once' : `${x.visits} times`}</Txt>
                </View>
                <Money cents={x.cents} />
                <Icon sf="chevron.right" md="chevron_right" size={13} color={c.label3} weight="bold" />
              </Tap>
            </View>
          )
        })}
      </Panel>
    </Section>
  )
}
