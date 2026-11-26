// Rings like Fitness's: each a rounded arc over a faint track of its own color, drawn in from the top with an ease-out
// when it appears and gliding to new values after. Past a full lap the ring keeps going round a second time over
// the first, its leading end casting a small shadow so the overlap reads, as Fitness draws it.
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { alpha } from '../theme'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const DRAW = Easing.bezier(0.25, 1, 0.5, 1)

export interface RingValue { value: number; color: string }

/** A ring's value as drawn: 0 for anything that isn't a number or is below zero, at most two laps. */
export const ringLaps = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 0)

function Arc({ size, stroke, inset, ring, delay }: { size: number; stroke: number; inset: number; ring: RingValue; delay: number }) {
  const c = size / 2
  const r = c - stroke / 2 - inset
  const len = 2 * Math.PI * r
  const target = ringLaps(ring.value)
  const shown = useSharedValue(0)
  useEffect(() => {
    shown.set(withDelay(delay, withTiming(target, { duration: target > 1 ? 1400 : 1100, easing: DRAW })))
  }, [target, delay, shown])
  const first = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - Math.min(1, shown.value)) }))
  const second = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - Math.max(0, Math.min(1, shown.value - 1))), strokeOpacity: shown.value > 1 ? 1 : 0 }))
  // The second lap's leading end, and its shadow a little behind it on the lap underneath.
  const at = (lag: number) => {
    'worklet'
    const a = 2 * Math.PI * Math.max(0, shown.value - 1) - Math.PI / 2 - lag
    return { cx: c + r * Math.cos(a), cy: c + r * Math.sin(a) }
  }
  const cap = useAnimatedProps(() => ({ ...at(0), fillOpacity: shown.value > 1 ? 1 : 0 }))
  const shadow = useAnimatedProps(() => ({ ...at(-stroke * 0.12 / r), fillOpacity: shown.value > 1.02 ? 0.35 : 0 }))
  const turn = `rotate(-90 ${c} ${c})`
  return (
    <>
      <Circle cx={c} cy={c} r={r} stroke={alpha(ring.color, 0.2)} strokeWidth={stroke} fill="none" />
      <AnimatedCircle cx={c} cy={c} r={r} stroke={ring.color} strokeWidth={stroke} fill="none"
        strokeLinecap="round" strokeDasharray={`${len} ${len}`} animatedProps={first} transform={turn} />
      {target > 1 && (
        <>
          <AnimatedCircle r={stroke / 2 + 0.5} fill="#000000" animatedProps={shadow} />
          <AnimatedCircle cx={c} cy={c} r={r} stroke={ring.color} strokeWidth={stroke} fill="none"
            strokeLinecap="round" strokeDasharray={`${len} ${len}`} animatedProps={second} transform={turn} />
          <AnimatedCircle r={stroke / 2} fill={ring.color} animatedProps={cap} />
        </>
      )}
    </>
  )
}

/** Outer ring first. `value` is the share of a lap (1 = full; up to 2 draws a second lap). `label`: what VoiceOver
 *  reads (say "Spent 62% of budget, 80% of month gone"); by default each ring's percent. */
export function Rings({ rings, size = 96, stroke = 13, gap = 2, label }: { rings: RingValue[]; size?: number; stroke?: number; gap?: number; label?: string }) {
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image"
      accessibilityLabel={label ?? rings.map((r) => `${Math.round((Number.isFinite(r.value) ? r.value : 0) * 100)}%`).join(', ')}>
      <Svg width={size} height={size}>
        {rings.map((ring, i) => <Arc key={i} size={size} stroke={stroke} inset={i * (stroke + gap)} ring={ring} delay={i * 120} />)}
      </Svg>
    </View>
  )
}
