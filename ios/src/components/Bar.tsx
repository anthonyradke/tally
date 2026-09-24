import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { useTheme } from '@/theme'

/** A progress bar that fills once when it first mounts. `notch` marks how much of the month has passed, so a bar
 *  running ahead of its notch is on pace to go over; one that is breathes a few times once it has filled. */
export function Bar({ value, color, notch, height = 8 }: { value: number; color: string; notch?: number; height?: number }) {
  const { c } = useTheme()
  const reduce = useReducedMotion()
  const v = Math.max(0, Math.min(1, value))
  const p = useSharedValue(reduce ? v : 0)
  const glow = useSharedValue(1)
  const ahead = notch != null && notch > 0 && notch < 1 && v > notch
  useEffect(() => { p.set(reduce ? v : withTiming(v, { duration: 700, easing: Easing.bezier(0.23, 1, 0.32, 1) })) }, [v, p, reduce])
  useEffect(() => {
    if (!ahead || reduce) return
    const breathe = withSequence(withTiming(0.5, { duration: 520, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 520, easing: Easing.inOut(Easing.quad) }))
    glow.set(withDelay(800, withRepeat(breathe, 3, false)))
  }, [ahead, reduce, glow])
  const fill = useAnimatedStyle(() => ({ opacity: glow.get(), transform: [{ scaleX: p.get() }] }))
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: c.fill, overflow: 'hidden' }}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', backgroundColor: color, borderRadius: height / 2, transformOrigin: 'left' }, fill]} />
      {notch != null && notch > 0 && notch < 1 && (
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: `${notch * 100}%`, width: 2, marginLeft: -1, backgroundColor: c.panel }} />
      )}
    </View>
  )
}
