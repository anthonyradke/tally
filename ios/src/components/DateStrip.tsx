import { useState } from 'react'
import { View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { addDays, dayLabel, fromISO } from '@/lib/dates'
import { useDraft } from '@/lib/draft'
import { useTally } from '@/lib/tally'
import { radius, space, useTheme } from '@/theme'
import { Icon } from './Icon'
import { DatePick } from './native/DatePick'
import { Tap } from './Tap'
import { Txt } from './Txt'

/** The date: this past week as a row of days, since entries often get caught up at the end of the week, and the
 *  calendar for anything older. */
export function DateStrip() {
  const { c } = useTheme()
  const t = useTally()
  const { d, set } = useDraft()
  const [cal, setCal] = useState(false)
  if (!t.b) return null
  const today = t.b.today
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).filter((x) => x >= t.b!.start)
  const inWeek = days.includes(d.date)
  return (
    <View style={{ gap: space.s }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space.l }}>
        <Txt variant="sub" tone="label2">{inWeek ? 'Date' : dayLabel(d.date, today)}</Txt>
        <Tap feedback="opacity" onPress={() => { Haptics.selectionAsync().catch(() => {}); setCal(!cal) }} hitSlop={10}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon sf="calendar" md="calendar_today" size={14} color={c.label} />
            <Txt variant="sub" style={{ fontWeight: '600' }}>{cal ? 'Hide calendar' : 'Calendar'}</Txt>
          </View>
        </Tap>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {days.map((iso) => {
          const on = iso === d.date
          const dt = fromISO(iso)
          return (
            <Tap key={iso} onPress={() => { Haptics.selectionAsync().catch(() => {}); set({ date: iso }) }} accessibilityLabel={dayLabel(iso, today)}
              accessibilityState={{ selected: on }}
              style={{ flex: 1, height: 58, borderRadius: 16, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: on ? c.ink : c.panel }}>
              <Txt variant="foot" tone={on ? 'onInk' : 'label2'} numberOfLines={1}>{iso === today ? 'Today' : dt.toLocaleDateString('en-US', { weekday: 'short' })}</Txt>
              <Txt variant="headline" tone={on ? 'onInk' : 'label'} num>{dt.getDate()}</Txt>
            </Tap>
          )
        })}
      </View>
      {cal && (
        <View style={{ backgroundColor: c.panel, borderRadius: radius.panel, borderCurve: 'continuous', padding: space.s }}>
          <DatePick value={d.date} min={t.b.start} onChange={(date) => set({ date })} />
        </View>
      )}
    </View>
  )
}
