// Rings like Fitness's: each a rounded arc over a faint track of its own color, drawn in from the top with an ease-out
// when it appears and gliding to new values after.
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { alpha } from '../theme'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const DRAW = Easing.bezier(0.25, 1, 0.5, 1)

export interface RingValue { value: number; color: string }

function Arc({ size, stroke, inset, ring, delay }: { size: number; stroke: number; inset: number; ring: RingValue; delay: number }) {
  const r = size / 2 - stroke / 2 - inset
  const len = 2 * Math.PI * r
  const shown = useSharedValue(0)
  useEffect(() => {
    shown.set(withDelay(delay, withTiming(Math.max(0, Math.min(1, ring.value)), { duration: 1100, easing: DRAW })))
  }, [ring.value, delay, shown])
  const props = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - shown.value) }))
  return (
    <>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={alpha(ring.color, 0.2)} strokeWidth={stroke} fill="none" />
      <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={ring.color} strokeWidth={stroke} fill="none"
        strokeLinecap="round" strokeDasharray={`${len} ${len}`} animatedProps={props}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </>
  )
}

/** Outer ring first. `value` is the share of a lap (1 = full). */
export function Rings({ rings, size = 96, stroke = 13, gap = 2 }: { rings: RingValue[]; size?: number; stroke?: number; gap?: number }) {
  return (
    <View style={{ width: size, height: size }} accessibilityRole="image"
      accessibilityLabel={rings.map((r) => `${Math.round(r.value * 100)}%`).join(', ')}>
      <Svg width={size} height={size}>
        {rings.map((ring, i) => <Arc key={i} size={size} stroke={stroke} inset={i * (stroke + gap)} ring={ring} delay={i * 120} />)}
      </Svg>
    </View>
  )
}
