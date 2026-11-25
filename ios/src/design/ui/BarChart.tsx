// Bars over time, read the way Health's charts are: a light grid with its scale on the right, a dashed average line,
// and a finger that picks a bar out (tap it, or press and slide along the bars; a tick on each new one) while the
// others dim. A quick swipe pages to the period before or after. Bars grow in from the baseline and glide to new
// heights when the data changes; nothing overshoots.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector, Directions } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import Svg, { Line } from 'react-native-svg'
import { compactCents } from '@/lib/money'
import { tick } from '../haptics'
import { EASE } from '../motion'
import { usePalette } from '../theme'
import { Txt } from './Txt'

/** `future`: a month that hasn't come yet: no bar and no baseline nub, just its label. */
export interface BarDatum { key: string; label: string; value: number; future?: boolean }

const H = 190
const SCALE_W = 46

/** A round top for the scale: 1, 2, 2.5 or 5 times a power of ten, at or above the largest value. */
function niceMax(v: number): number {
  if (v <= 0) return 100_00
  const p = 10 ** Math.floor(Math.log10(v))
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= v) ?? 10) * p
}

function Bar({ value, max, i, dim, color, width, future }: { value: number; max: number; i: number; dim: boolean; color: string; width: number; future?: boolean }) {
  const p = usePalette()
  const h = useSharedValue(0)
  const target = value > 0 ? Math.max(3, (value / max) * H) : 0
  useEffect(() => { h.set(withDelay(Math.min(i, 24) * 18, withTiming(target, { duration: 520, easing: EASE }))) }, [target, i, h])
  const op = useSharedValue(1)
  useEffect(() => { op.set(withTiming(dim ? 0.3 : 1, { duration: 160, easing: EASE })) }, [dim, op])
  const anim = useAnimatedStyle(() => ({ height: h.value, opacity: op.value }))
  return (
    <View style={{ flex: 1, height: H, justifyContent: 'flex-end', alignItems: 'center' }}>
      {value <= 0 && !future && <View style={{ width, height: 2, borderRadius: 1, backgroundColor: p.fill2 }} />}
      <Animated.View style={[{ width, borderTopLeftRadius: Math.min(6, width / 2), borderTopRightRadius: Math.min(6, width / 2),
        borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: color }, anim]} />
    </View>
  )
}

export function BarChart({ bars, color, average, selected, onSelect, onPage, labelEvery = 1 }: {
  bars: BarDatum[]; color: string; average?: number; selected: number | null; onSelect: (i: number | null) => void
  onPage?: (dir: -1 | 1) => void; labelEvery?: number
}) {
  const p = usePalette()
  const [w, setW] = useState(0)
  const max = niceMax(Math.max(...bars.map((b) => b.value), average ?? 0, 0))
  const plotW = Math.max(0, w - SCALE_W)
  const n = Math.max(1, bars.length)
  const slot = plotW / n
  const barW = Math.max(3, Math.min(28, slot * 0.62))

  const pickAt = (x: number) => {
    const i = Math.max(0, Math.min(n - 1, Math.floor(x / Math.max(1, slot))))
    if (i !== selected) { tick(); onSelect(i) }
  }
  const tapAt = (x: number) => {
    const i = Math.max(0, Math.min(n - 1, Math.floor(x / Math.max(1, slot))))
    tick(); onSelect(i === selected ? null : i)
  }
  const page = (dir: -1 | 1) => { if (onPage) { tick(); onSelect(null); onPage(dir) } }

  const scrub = Gesture.Pan().activateAfterLongPress(160)
    .onStart((e) => { scheduleOnRN(pickAt, e.x) })
    .onUpdate((e) => { scheduleOnRN(pickAt, e.x) })
  const tap = Gesture.Tap().maxDuration(250).onEnd((e) => { scheduleOnRN(tapAt, e.x) })
  const older = Gesture.Fling().direction(Directions.RIGHT).onEnd(() => { scheduleOnRN(page, -1) })
  const newer = Gesture.Fling().direction(Directions.LEFT).onEnd(() => { scheduleOnRN(page, 1) })
  const gesture = Gesture.Race(scrub, Gesture.Exclusive(older, newer), tap)

  const grid = [max, max / 2, 0]
  const avgY = average && average > 0 ? H - (average / max) * H : null
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityRole="adjustable">
      <View style={{ height: H }}>
        {/* The grid and its scale on the right, as Health draws them. */}
        {grid.map((v) => (
          <View key={v} style={{ position: 'absolute', left: 0, right: 0, top: H - (v / max) * H - 0.5, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, height: 0.5, backgroundColor: v === 0 ? p.separator : p.fill3 }} />
            <Txt v="caption2" tone="label2" num style={{ width: SCALE_W, paddingLeft: 6, marginTop: v === 0 ? 0 : 12 }}>{v === 0 ? '0' : compactCents(v)}</Txt>
          </View>
        ))}
        <GestureDetector gesture={gesture}>
          <View style={{ position: 'absolute', left: 0, top: 0, width: plotW, height: H, flexDirection: 'row' }}>
            {bars.map((b, i) => (
              <Bar key={b.key} value={b.value} max={max} i={i} color={color} width={barW} future={b.future} dim={selected !== null && selected !== i} />
            ))}
          </View>
        </GestureDetector>
        {avgY !== null && plotW > 0 && (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: avgY - 1, width: plotW, height: 2 }}>
            <Svg width={plotW} height={2}>
              <Line x1={0} y1={1} x2={plotW} y2={1} stroke={p.label2} strokeWidth={1.5} strokeDasharray="4 4" />
            </Svg>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', width: plotW, marginTop: 6 }}>
        {bars.map((b, i) => (
          <View key={b.key} style={{ flex: 1, height: 14, alignItems: 'center' }}>
            {/* Wider than its bar, so a label shown every few bars ("2025", "15") never clips. */}
            {i % labelEvery === 0 && b.label ? (
              <Txt v="caption2" tone={selected === i ? 'label' : 'label2'} weight={selected === i ? '600' : '400'} numberOfLines={1}
                style={{ position: 'absolute', width: 56, left: '50%', marginLeft: -28, textAlign: 'center' }}>{b.label}</Txt>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  )
}
