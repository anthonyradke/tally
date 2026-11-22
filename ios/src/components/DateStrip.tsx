import { useEffect, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { addDays, dayLabel, fromISO } from '@/lib/dates'
import { useDraft } from '@/lib/draft'
import { useTally } from '@/lib/tally'
import { radius, space, useTheme } from '@/theme'
import { Icon } from './Icon'
import { DatePick } from './native/DatePick'
import { Tap } from './Tap'
import { Txt } from './Txt'

const GAP = 6
/** How far back the strip stretches to reach a day; anything older is the calendar's. */
const REACH = 62

/** The days from `first` to `last`, oldest first. */
function span(first: string, last: string): string[] {
  const out: string[] = []
  for (let d = first; d <= last; d = addDays(d, 1)) out.push(d)
  return out
}

/** The date: this past week as a row of days, since entries often get caught up at the end of the week, and the
 *  calendar for anything older. A draft that starts on an older day (Catch up resuming where an account left off)
 *  stretches the row back to it, and the row scrolls from there to today, so the bank's list can be followed day by
 *  day. It only ever grows while it's open, so nothing moves under a finger. */
export function DateStrip() {
  const { c } = useTheme()
  const t = useTally()
  const { d, set } = useDraft()
  const [cal, setCal] = useState(false)
  const [reach, setReach] = useState<string | null>(null)
  const [width, setWidth] = useState(0)
  const scroller = useRef<ScrollView>(null)
  const x = useRef(0)
  const today = t.today
  const week = addDays(today, -6)
  const older = d.date < week && d.date >= addDays(today, -REACH) ? d.date : null
  if (older && (!reach || older < reach)) setReach(older)
  const first = reach && reach < week ? reach : week
  const days = t.b ? span(first, today).filter((x) => x >= t.b!.start) : []
  const scrolls = days.length > 7
  const cell = width ? (width - GAP * 6) / 7 : 0
  const step = cell + GAP

  // Keep the picked day in view: on the first layout, and when the calendar picks one that's scrolled off.
  useEffect(() => {
    if (!scrolls || !cell) return
    const i = days.indexOf(d.date)
    if (i < 0) return
    const left = Math.round(x.current / step)
    if (i >= left && i < left + 7) return
    const to = Math.min((days.length - 7) * step, i * step) // the picked day first, the days after it to its right
    scroller.current?.scrollTo({ x: to, animated: x.current > 0 })
    x.current = to
  }, [d.date, scrolls, cell, days.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!t.b) return null
  const inStrip = days.includes(d.date)
  const day = (iso: string) => {
    const on = iso === d.date
    const dt = fromISO(iso)
    return (
      <Tap key={iso} onPress={() => { Haptics.selectionAsync().catch(() => {}); set({ date: iso }) }} accessibilityLabel={dayLabel(iso, today)}
        accessibilityState={{ selected: on }}
        style={{ ...(scrolls ? { width: cell } : { flex: 1 }), height: 58, borderRadius: 16, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: on ? c.ink : c.panel }}>
        <Txt variant="foot" tone={on ? 'onInk' : 'label2'} numberOfLines={1}>{iso === today ? 'Today' : dt.toLocaleDateString('en-US', { weekday: 'short' })}</Txt>
        <Txt variant="headline" tone={on ? 'onInk' : 'label'} num>{dt.getDate()}</Txt>
      </Tap>
    )
  }
  return (
    <View style={{ gap: space.s }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space.l }}>
        <Txt variant="sub" tone="label2">{inStrip && d.date >= week ? 'Date' : dayLabel(d.date, today)}</Txt>
        <Tap feedback="opacity" onPress={() => { Haptics.selectionAsync().catch(() => {}); setCal(!cal) }} hitSlop={10}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon sf="calendar" md="calendar_today" size={14} color={c.label} />
            <Txt variant="sub" style={{ fontWeight: '600' }}>{cal ? 'Hide calendar' : 'Calendar'}</Txt>
          </View>
        </Tap>
      </View>
      {scrolls ? (
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {cell > 0 && (
            <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} snapToInterval={step} decelerationRate="fast"
              onScroll={(e) => { x.current = e.nativeEvent.contentOffset.x }} scrollEventThrottle={32} contentContainerStyle={{ gap: GAP }}>
              {days.map(day)}
            </ScrollView>
          )}
          {!cell && <View style={{ height: 58 }} />}
        </View>
      ) : (
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', gap: GAP }}>{days.map(day)}</View>
      )}
      {cal && (
        <View style={{ backgroundColor: c.panel, borderRadius: radius.panel, borderCurve: 'continuous', padding: space.s }}>
          <DatePick value={d.date} min={t.b.start} onChange={(date) => set({ date })} />
        </View>
      )}
    </View>
  )
}
