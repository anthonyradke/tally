// Insights' month calendar: each day a tile, deeper ink the more went out that day, hollow when nothing did. Tapping
// a day reads out its total; tapping it again (or "See entries") opens that day in Activity.
import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import type { Bootstrap } from '@/lib/api'
import { bigWeekday, daysOf } from '@/lib/calendar'
import { useTransactions } from '@/lib/data'
import { addDays, dayLabel, fromISO, lastOfMonth } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { useHidden } from '@/lib/privacy'
import { play } from '@/lib/sound'
import { space, useTheme } from '@/theme'
import { Icon } from './Icon'
import { Panel, Section } from './Panel'
import { Tap } from './Tap'
import { Txt } from './Txt'

const HEAD = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function SpendCalendar({ b, month }: { b: Bootstrap; month: string }) {
  const { c } = useTheme()
  const hidden = useHidden()
  const [picked, setPicked] = useState<string | null>(null)
  const q = useTransactions({ type: 'Spending', start: month, end: lastOfMonth(month), limit: 3000 })
  const hist = useTransactions({ type: 'Spending', start: addDays(b.today, -84), end: b.today, limit: 5000 })
  const days = daysOf(month, q.data?.items ?? [])
  const max = Math.max(1, ...days.filter((d) => d.date <= b.today).map((d) => d.cents))
  const lead = (fromISO(month).getDay() + 6) % 7 // weeks start on Monday
  const past = days.filter((d) => d.date <= b.today)
  const quiet = past.filter((d) => d.cents <= 0).length
  const big = hist.data ? bigWeekday(hist.data.items, b.today, b.start) : null
  const sel = days.find((d) => d.date === picked)
  const open = (date: string) => router.push({ pathname: '/activity', params: { day: date } })
  const tap = (date: string) => {
    if (date === picked) { open(date); return }
    Haptics.selectionAsync().catch(() => {})
    play('tick', 0.5)
    setPicked(date)
  }
  return (
    <Section title="Day by day">
      <Panel style={{ gap: space.m }}>
        <View style={{ flexDirection: 'row' }}>
          {HEAD.map((h, i) => <Txt key={i} variant="foot" tone="label2" style={{ width: `${100 / 7}%`, textAlign: 'center' }}>{h}</Txt>)}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 }}>
          {Array.from({ length: lead }, (_, i) => <View key={`l${i}`} style={{ width: `${100 / 7}%` }} />)}
          {days.map((d) => {
            const future = d.date > b.today
            const k = d.cents > 0 && !future ? 0.16 + 0.84 * Math.sqrt(d.cents / max) : 0
            const on = d.date === picked
            return (
              <View key={d.date} style={{ width: `${100 / 7}%`, alignItems: 'center' }}>
                <Tap feedback="scale" onPress={() => tap(d.date)} disabled={future && d.cents <= 0}
                  accessibilityLabel={`${dayLabel(d.date, b.today)}: ${d.cents > 0 ? `${formatCents(d.cents)} ${future ? 'scheduled' : 'spent'}` : future ? 'nothing scheduled' : 'nothing spent'}`}
                  style={{ width: 40, height: 40, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center',
                    borderWidth: on || d.date === b.today ? 2 : 0, borderColor: on ? c.ink : c.label3 }}>
                  <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 10, backgroundColor: c.ink, opacity: hidden ? (k > 0 ? 0.3 : 0) : k }} />
                  <Txt variant="sub" num style={{ color: future ? c.label3 : k > 0.5 && !hidden ? c.onInk : c.label, fontWeight: '600' }}>{fromISO(d.date).getDate()}</Txt>
                  {future && d.cents > 0 && <View style={{ position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: c.label2 }} />}
                </Tap>
              </View>
            )
          })}
        </View>
        {sel ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 22 }}>
            <Txt variant="callout" num>
              <Txt variant="callout" style={{ fontWeight: '600' }}>{dayLabel(sel.date, b.today)}</Txt>
              {sel.cents > 0 ? `, ${formatCents(sel.cents)} ${sel.date > b.today ? 'scheduled' : 'spent'}` : ', nothing spent'}
            </Txt>
            <Tap feedback="opacity" onPress={() => open(sel.date)} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Txt variant="callout" tone="label2">See entries</Txt>
              <Icon sf="chevron.right" md="chevron_right" size={12} color={c.label2} />
            </Tap>
          </View>
        ) : (
          <Txt variant="callout" tone="label2" style={{ minHeight: 22 }}>
            {past.length ? `${quiet} of ${past.length} days without spending${big ? `. ${big.day} cost the most, ${formatCents(big.avg, { cents: false })} on average.` : '.'}` : 'Nothing yet.'}
          </Txt>
        )}
      </Panel>
    </Section>
  )
}
