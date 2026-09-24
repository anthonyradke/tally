// A checkmark in a circle that draws itself: the circle sweeps round, then the tick strokes in.
import { useEffect } from 'react'
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import Svg, { Circle, Path } from 'react-native-svg'
import { EASE } from './ease'

const ACircle = Animated.createAnimatedComponent(Circle)
const APath = Animated.createAnimatedComponent(Path)
const R = 10.5
const RING = 2 * Math.PI * R
const TICK = 13 // length of the tick path below, near enough

export function CheckDraw({ size = 24, color, ring = true }: { size?: number; color: string; ring?: boolean }) {
  const reduce = useReducedMotion()
  const a = useSharedValue(reduce ? 1 : 0)
  const b = useSharedValue(reduce ? 1 : 0)
  useEffect(() => {
    if (reduce) return
    a.set(withTiming(1, { duration: 320, easing: EASE }))
    b.set(withDelay(ring ? 180 : 0, withTiming(1, { duration: 260, easing: EASE })))
  }, [a, b, reduce, ring])
  const circle = useAnimatedProps(() => ({ strokeDashoffset: RING * (1 - a.get()) }))
  const tick = useAnimatedProps(() => ({ strokeDashoffset: TICK * (1 - b.get()) }))
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {ring && <ACircle cx={12} cy={12} r={R} stroke={color} strokeWidth={2} fill="none" strokeDasharray={RING}
        animatedProps={circle} strokeLinecap="round" rotation={-90} origin="12, 12" />}
      <APath d="M7.2 12.4 L10.6 15.6 L16.8 8.8" stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={TICK} animatedProps={tick} />
    </Svg>
  )
}
