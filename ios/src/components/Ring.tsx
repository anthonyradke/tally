import { useEffect } from 'react'
import Svg, { Circle } from 'react-native-svg'
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { useTheme } from '@/theme'

const ACircle = Animated.createAnimatedComponent(Circle)

/** A single progress ring. Draws once on mount. */
export function Ring({ value, color, size = 44, stroke = 5 }: { value: number; color: string; size?: number; stroke?: number }) {
  const { c } = useTheme()
  const reduce = useReducedMotion()
  const r = (size - stroke) / 2
  const len = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  const p = useSharedValue(reduce ? v : 0)
  useEffect(() => { p.set(reduce ? v : withTiming(v, { duration: 800, easing: Easing.bezier(0.23, 1, 0.32, 1) })) }, [v, p, reduce])
  const props = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - p.get()) }))
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.fill} strokeWidth={stroke} fill="none" />
      <ACircle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={`${len} ${len}`} animatedProps={props} />
    </Svg>
  )
}
