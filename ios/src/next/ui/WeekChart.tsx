// A week of spending as bars, one per day, each split by category color, like Apple Card's weekly activity. The
// bars rise in one after another on a soft ease-out; touching a day picks it out and dims the rest.
import { useEffect } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { tick } from '../haptics'
import { EASE } from '../motion'
import { usePalette } from '../theme'
import { Txt } from './Txt'

export interface Day { date: string; letter: string; total: number; parts: { color: string; cents: number }[]; today?: boolean }

const H = 132

function Bar({ d, max, i, dim, onPress }: { d: Day; max: number; i: number; dim: boolean; onPress: () => void }) {
  const p = usePalette()
  const h = useSharedValue(0)
  const target = max > 0 && d.total > 0 ? Math.max(6, (d.total / max) * H) : 4 // a nub on a quiet day keeps the week's rhythm
  useEffect(() => { h.set(withDelay(i * 30, withTiming(target, { duration: 650, easing: EASE }))) }, [target, i, h])
  const anim = useAnimatedStyle(() => ({ height: h.value }))
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 8 }} accessibilityLabel={`${d.letter}: ${(d.total / 100).toFixed(2)} dollars`}>
      <View style={{ height: H, justifyContent: 'flex-end' }}>
        <Animated.View style={[{ width: 22, borderRadius: 11, overflow: 'hidden', backgroundColor: p.fill3, opacity: dim ? 0.3 : 1, flexDirection: 'column-reverse' }, anim]}>
          {d.parts.map((x, k) => <View key={k} style={{ flex: x.cents, backgroundColor: x.color }} />)}
        </Animated.View>
      </View>
      <Txt v="caption" weight={d.today ? '700' : '500'} tone={d.today ? 'label' : 'label2'}>{d.letter}</Txt>
    </Pressable>
  )
}

export function WeekChart({ days, picked, onPick }: { days: Day[]; picked: number | null; onPick: (i: number | null) => void }) {
  const max = Math.max(...days.map((d) => d.total), 0)
  return (
    <View style={{ flexDirection: 'row' }}>
      {days.map((d, i) => (
        <Bar key={d.date} d={d} max={max} i={i} dim={picked !== null && picked !== i}
          onPress={() => { tick(); onPick(picked === i ? null : i) }} />
      ))}
    </View>
  )
}
