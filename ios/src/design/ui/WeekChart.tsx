// A week of spending as bars, one per day, each split by category color, like Apple Card's weekly activity. The
// bars rise in one after another on a soft ease-out; touching a day picks it out and dims the rest.
import { useEffect } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { fromISO } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { tick } from '../haptics'
import { EASE } from '../motion'
import { usePalette } from '../theme'
import { Txt } from './Txt'

/** `future`: a day still to come, which can't be picked; `a11y`: what VoiceOver reads for it ("Tuesday, $12.00"). */
export interface Day { date: string; letter: string; total: number; parts: { color: string; cents: number }[]; today?: boolean; future?: boolean; a11y?: string }


function Bar({ d, max, i, dim, selected, onPress, H }: { d: Day; max: number; i: number; dim: boolean; selected: boolean; onPress: () => void; H: number }) {
  const p = usePalette()
  const h = useSharedValue(0)
  const target = max > 0 && d.total > 0 ? Math.max(6, (d.total / max) * H) : 4 // a nub on a quiet day keeps the week's rhythm
  useEffect(() => { h.set(withDelay(i * 30, withTiming(target, { duration: 650, easing: EASE }))) }, [target, i, h])
  const op = useSharedValue(1)
  useEffect(() => { op.set(withTiming(dim ? 0.3 : 1, { duration: 160, easing: EASE })) }, [dim, op])
  const anim = useAnimatedStyle(() => ({ height: h.value, opacity: op.value }))
  const day = fromISO(d.date).toLocaleDateString('en-US', { weekday: 'long' })
  return (
    <Pressable onPress={onPress} disabled={d.future} style={{ flex: 1, alignItems: 'center', gap: 8 }} accessibilityRole="button"
      accessibilityLabel={d.a11y ?? `${day}${d.today ? ', today' : ''}, ${formatCents(d.total)}`} accessibilityState={{ selected, disabled: !!d.future }}>
      <View style={{ height: H, justifyContent: 'flex-end' }}>
        <Animated.View style={[{ width: 22, borderRadius: 11, overflow: 'hidden', backgroundColor: p.fill3, flexDirection: 'column-reverse' }, anim]}>
          {d.parts.map((x, k) => <View key={k} style={{ flex: x.cents, backgroundColor: x.color }} />)}
        </Animated.View>
      </View>
      <Txt v="caption" weight={d.today ? '700' : '500'} tone={d.today ? 'label' : d.future ? 'label3' : 'label2'}>{d.letter}</Txt>
    </Pressable>
  )
}

/** `height`: the tallest bar's (132 by default). */
export function WeekChart({ days, picked, onPick, height = 132 }: { days: Day[]; picked: number | null; onPick: (i: number | null) => void; height?: number }) {
  const max = Math.max(...days.map((d) => d.total), 0)
  return (
    <View style={{ flexDirection: 'row' }}>
      {days.map((d, i) => (
        <Bar key={d.date} d={d} max={max} i={i} H={height} dim={picked !== null && picked !== i} selected={picked === i}
          onPress={() => { tick(); onPick(picked === i ? null : i) }} />
      ))}
    </View>
  )
}
