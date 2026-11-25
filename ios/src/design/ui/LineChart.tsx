// A balance over time, Robinhood style: a single line with a soft fill under it. Drag a finger across it to read
// any point; a tick marks each step, and the figure above follows (`onScrub`). Letting go returns to today.
import { useState } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { tick } from '../haptics'
import { alpha, usePalette } from '../theme'

export function LineChart({ points, color, height = 132, onScrub }: {
  points: number[]; color: string; height?: number; onScrub?: (i: number | null) => void
}) {
  const p = usePalette()
  const [w, setW] = useState(0)
  const x = useSharedValue(-1)
  const last = useSharedValue(-1)
  const n = points.length
  const lo = Math.min(...points), hi = Math.max(...points)
  const span = hi - lo || 1
  const pad = 6
  const px = (i: number) => (n > 1 ? (i / (n - 1)) * w : w / 2)
  const py = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2)
  const line = points.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')
  const area = n > 1 ? `${line} L${w},${height} L0,${height} Z` : ''

  const report = (i: number | null) => { if (i !== null) tick(); onScrub?.(i) }
  const pick = (ax: number) => {
    'worklet'
    const i = Math.max(0, Math.min(n - 1, Math.round((ax / Math.max(1, w)) * (n - 1))))
    x.value = n > 1 ? (i / (n - 1)) * w : w / 2
    if (i !== last.value) { last.value = i; scheduleOnRN(report, i) }
  }
  const pan = Gesture.Pan().activeOffsetX([-6, 6]).failOffsetY([-14, 14])
    .onBegin((e) => { pick(e.x) }).onUpdate((e) => { pick(e.x) })
    .onFinalize(() => { x.value = withTiming(-1, { duration: 0 }); last.value = -1; scheduleOnRN(report, null) })
  const cursor = useAnimatedStyle(() => ({ opacity: x.value < 0 ? 0 : 1, transform: [{ translateX: Math.max(0, x.value) }] }))

  return (
    <GestureDetector gesture={pan}>
      <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && n > 0 && (
          <Svg width={w} height={height}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {area ? <Path d={area} fill="url(#fill)" /> : null}
            <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
        )}
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: -0.75, width: 1.5, backgroundColor: alpha(p.gray, 0.6) }, cursor]} />
      </View>
    </GestureDetector>
  )
}
