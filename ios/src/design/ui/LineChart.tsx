// A balance over time, Robinhood style: a single line with a soft fill under it. Drag a finger across it to read
// any point (or press and hold, then slide); a tick marks each step, and the figure above follows (`onScrub`).
// Letting go returns to today. A vertical scroll that starts on the chart stays a scroll.
import { useId, useState } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { tick } from '../haptics'
import { alpha, usePalette } from '../theme'
import { linePath } from './chart'

/** `label`: what VoiceOver reads for a point (say "March, $12,400"); without it the value alone. */
export function LineChart({ points, color, height = 132, onScrub, label }: {
  points: number[]; color: string; height?: number; onScrub?: (i: number | null) => void; label?: (i: number) => string
}) {
  const p = usePalette()
  const fillId = `fill${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [w, setW] = useState(0)
  const [a11y, setA11y] = useState<number | null>(null)
  const x = useSharedValue(-1)
  const last = useSharedValue(-1)
  const n = points.length
  const { line, area } = linePath(points, w, height)

  const report = (i: number | null) => { if (i !== null) tick(); onScrub?.(i) }
  const pick = (ax: number) => {
    'worklet'
    const i = Math.max(0, Math.min(n - 1, Math.round((ax / Math.max(1, w)) * (n - 1))))
    x.value = n > 1 ? (i / (n - 1)) * w : w / 2
    if (i !== last.value) { last.value = i; scheduleOnRN(report, i) }
  }
  const end = () => {
    'worklet'
    x.value = -1
    if (last.value !== -1) { last.value = -1; scheduleOnRN(report, null) }
  }
  // Nothing happens on touch-down: the pan starts only once the finger moves sideways (a vertical move fails it, so
  // the page scrolls), and a press-and-hold starts it in place, like Stocks.
  // onEnd, not onFinalize: it only runs for the one that took over, so the other one failing doesn't reset the cursor.
  const slide = Gesture.Pan().activeOffsetX([-8, 8]).failOffsetY([-10, 10])
    .onStart((e) => { pick(e.x) }).onUpdate((e) => { pick(e.x) }).onEnd(() => { end() })
  const hold = Gesture.Pan().activateAfterLongPress(220).failOffsetY([-10, 10])
    .onStart((e) => { pick(e.x) }).onUpdate((e) => { pick(e.x) }).onEnd(() => { end() })
  const gesture = Gesture.Race(slide, hold)
  const cursor = useAnimatedStyle(() => ({ opacity: x.value < 0 ? 0 : 1, transform: [{ translateX: Math.max(0, x.value) }] }))

  const say = (i: number) => (label ? label(i) : String(Math.round(points[i] ?? 0)))
  const step = (d: -1 | 1) => {
    if (!n) return
    const i = Math.max(0, Math.min(n - 1, (a11y ?? n - 1) + d))
    setA11y(i); onScrub?.(i === n - 1 ? null : i)
  }
  return (
    <GestureDetector gesture={gesture}>
      <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}
        accessible accessibilityRole="adjustable" accessibilityLabel="Chart"
        accessibilityValue={n ? { text: say(a11y ?? n - 1) } : undefined}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
        {w > 0 && n > 0 && (
          <Svg width={w} height={height}>
            <Defs>
              <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {area ? <Path d={area} fill={`url(#${fillId})`} /> : null}
            <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
        )}
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: -0.75, width: 1.5, backgroundColor: alpha(p.gray, 0.6) }, cursor]} />
      </View>
    </GestureDetector>
  )
}
