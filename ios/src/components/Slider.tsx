// A slider for trying out a figure: drag the thumb (or tap the track) and it moves in steps, ticking under the finger
// like the system pickers. The value is reported per step, so the text around it follows live.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import * as Haptics from 'expo-haptics'
import { play } from '@/lib/sound'
import { useTheme } from '@/theme'

const THUMB = 28

export function Slider({ value, steps, onChange, label }: {
  /** The current step, 0..steps. */
  value: number
  steps: number
  onChange: (step: number) => void
  label: string
}) {
  const { c } = useTheme()
  const [w, setW] = useState(0)
  const x = useSharedValue(0) // thumb position in px
  const grab = useSharedValue(0)
  const last = useSharedValue(value)
  const track = Math.max(1, w - THUMB)
  useEffect(() => { if (w) x.set(withSpring((value / steps) * track, { damping: 24, stiffness: 300 })) }, [value, steps, track, w, x])
  const tick = (s: number) => { Haptics.selectionAsync().catch(() => {}); play('tick', 0.35); onChange(s) }
  const at = (px: number) => {
    'worklet'
    const k = Math.max(0, Math.min(1, (px - THUMB / 2) / track))
    const s = Math.round(k * steps)
    x.set(k * track)
    if (s !== last.get()) { last.set(s); scheduleOnRN(tick, s) }
  }
  const pan = Gesture.Pan().activeOffsetX([-4, 4]).failOffsetY([-14, 14])
    .onBegin((e) => { grab.set(withSpring(1, { damping: 18, stiffness: 400 })); at(e.x) })
    .onUpdate((e) => at(e.x))
    .onFinalize(() => {
      grab.set(withSpring(0, { damping: 18, stiffness: 400 }))
      x.set(withSpring((last.get() / steps) * track, { damping: 24, stiffness: 300 }))
    })
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { scale: 1 + grab.get() * 0.15 }] }))
  const fill = useAnimatedStyle(() => ({ width: x.get() + THUMB / 2 }))
  return (
    <GestureDetector gesture={pan}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 36, justifyContent: 'center' }}
        accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min: 0, max: steps, now: value }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(Math.max(0, Math.min(steps, value + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: c.fill, overflow: 'hidden' }}>
          <Animated.View style={[{ height: 6, backgroundColor: c.ink }, fill]} />
        </View>
        <Animated.View style={[{ position: 'absolute', left: 0, width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: '#FFFFFF',
          boxShadow: '0 1px 6px rgba(0,0,0,0.25)' }, thumb]} />
      </View>
    </GestureDetector>
  )
}
