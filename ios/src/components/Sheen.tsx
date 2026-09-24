// A band of light that sweeps once across a figure. The band is a moving window over a second copy of the figure in
// the highlight color, so the light only lands on the glyphs, not the background around them.
import { useEffect, useState, type ReactNode } from 'react'
import { View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { EASE } from './ease'

const BAND = 64

export function Sheen({ play, render, color, delay = 750 }: { play: boolean; render: (color?: string) => ReactNode; color: string; delay?: number }) {
  const reduce = useReducedMotion()
  const [w, setW] = useState(0)
  const x = useSharedValue(-BAND)
  useEffect(() => {
    if (!play || !w || reduce) return
    x.set(-BAND)
    x.set(withDelay(delay, withTiming(w + BAND, { duration: 1100, easing: EASE })))
  }, [play, w, reduce, delay, x])
  const band = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }))
  const copy = useAnimatedStyle(() => ({ transform: [{ translateX: -x.get() }] }))
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ alignSelf: 'flex-start' }}>
      {render()}
      {play && !reduce && w > 0 && (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: BAND, overflow: 'hidden' }, band]}>
          <Animated.View style={[{ width: w }, copy]}>{render(color)}</Animated.View>
        </Animated.View>
      )}
    </View>
  )
}
