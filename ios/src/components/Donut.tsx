import { useEffect } from 'react'
import Svg, { Circle, G } from 'react-native-svg'
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { useTheme } from '@/theme'

const ACircle = Animated.createAnimatedComponent(Circle)

/** Share of a whole, one arc per slice with small gaps; draws once (the "arrival" moment). A selected slice stays
 *  full strength and the rest fade back. */
export function Donut({ slices, size = 200, stroke = 22, selected }: { slices: { value: number; color: string; key: string }[]; size?: number; stroke?: number; selected?: string | null }) {
  const { c } = useTheme()
  const reduce = useReducedMotion()
  const p = useSharedValue(reduce ? 1 : 0)
  useEffect(() => { if (!reduce) p.set(withTiming(1, { duration: 900, easing: Easing.bezier(0.23, 1, 0.32, 1) })) }, [p, reduce])
  const r = (size - stroke) / 2
  const len = 2 * Math.PI * r
  const total = slices.reduce((n, s) => n + s.value, 0) || 1
  const gap = slices.length > 1 ? 3 : 0
  let acc = 0
  return (
    <Svg width={size} height={size}>
      <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.fill} strokeWidth={stroke} fill="none" />
        {slices.map((s) => {
          const seg = (s.value / total) * len
          const start = acc
          acc += seg
          return <Arc key={s.key} r={r} size={size} stroke={stroke} len={len} seg={Math.max(0, seg - gap)} start={start}
            color={s.color} dim={!!selected && selected !== s.key} p={p} />
        })}
      </G>
    </Svg>
  )
}

function Arc({ r, size, stroke, len, seg, start, color, dim, p }: { r: number; size: number; stroke: number; len: number; seg: number; start: number; color: string; dim: boolean; p: { get: () => number } }) {
  const props = useAnimatedProps(() => {
    const k = p.get()
    return { strokeDasharray: [seg * k, len], strokeDashoffset: -start * k }
  })
  return <ACircle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" opacity={dim ? 0.25 : 1} animatedProps={props as never} />
}
