// The success mark from Apple Pay: a ring that draws itself closed, then the check drawn in one stroke, with the
// system's success haptic as the check lands.
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import Svg, { Circle, Path } from 'react-native-svg'
import { scheduleOnRN } from 'react-native-worklets'
import { success } from '../haptics'
import { EASE } from '../motion'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const AnimatedPath = Animated.createAnimatedComponent(Path)

export function Checkmark({ size = 96, color, delay = 150 }: { size?: number; color: string; delay?: number }) {
  const ring = useSharedValue(0)
  const tick = useSharedValue(0)
  const stroke = size * 0.06
  const r = (size - stroke) / 2
  const around = 2 * Math.PI * r
  const check = size * 0.62 // the check path's length, near enough
  useEffect(() => {
    ring.set(withDelay(delay, withTiming(1, { duration: 520, easing: EASE })))
    tick.set(withDelay(delay + 380, withTiming(1, { duration: 340, easing: EASE }, (done) => { if (done) scheduleOnRN(success) })))
  }, [ring, tick, delay])
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: around * (1 - ring.value) }))
  const tickProps = useAnimatedProps(() => ({ strokeDashoffset: check * (1 - tick.value) }))
  const s = size
  return (
    <View style={{ width: s, height: s }}>
      <Svg width={s} height={s}>
        <AnimatedCircle cx={s / 2} cy={s / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${around} ${around}`} animatedProps={ringProps} rotation={-90} origin={`${s / 2}, ${s / 2}`} />
        <AnimatedPath d={`M${s * 0.3} ${s * 0.52} L${s * 0.44} ${s * 0.66} L${s * 0.71} ${s * 0.37}`} stroke={color} strokeWidth={stroke}
          fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${check} ${check}`} animatedProps={tickProps} />
      </Svg>
    </View>
  )
}
