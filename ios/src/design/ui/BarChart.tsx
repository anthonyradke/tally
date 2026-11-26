// Bars over time, read the way Health's charts are: a light grid with its scale on the right, a dashed average line,
// and a finger that picks a bar out (tap it, or press and slide along the bars; a tick on each new one) while the
// others dim. A quick swipe pages to the period before or after. Bars grow in from the baseline and glide to new
// heights when the data changes; nothing overshoots. VoiceOver swipes up and down through the bars.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector, Directions } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import Svg, { Line } from 'react-native-svg'
import { formatCents } from '@/lib/money'
import { soft, tick } from '../haptics'
import { EASE } from '../motion'
import { usePalette } from '../theme'
import { barHeight, barScale } from './chart'
import { Txt } from './Txt'

/** `future`: a month that hasn't come yet: no bar and no baseline nub, just its label. */
export interface BarDatum { key: string; label: string; value: number; future?: boolean }

const H = 190
const SCALE_W = 46

function Bar({ value, max, i, dim, color, width, future }: { value: number; max: number; i: number; dim: boolean; color: string; width: number; future?: boolean }) {
  const p = usePalette()
  const h = useSharedValue(0)
  const target = barHeight(value, max, H)
  useEffect(() => { h.set(withDelay(Math.min(i, 24) * 18, withTiming(target, { duration: 520, easing: EASE }))) }, [target, i, h])
  const op = useSharedValue(1)
  useEffect(() => { op.set(withTiming(dim ? 0.3 : 1, { duration: 160, easing: EASE })) }, [dim, op])
  const anim = useAnimatedStyle(() => ({ height: h.value, opacity: op.value }))
  return (
    <View style={{ flex: 1, height: H, justifyContent: 'flex-end', alignItems: 'center' }}>
      {target === 0 && !future && <View style={{ width, height: 2, borderRadius: 1, backgroundColor: p.fill2 }} />}
      <Animated.View style={[{ width, borderTopLeftRadius: Math.min(6, width / 2), borderTopRightRadius: Math.min(6, width / 2),
        borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: color }, anim]} />
    </View>
  )
}

/** `onPage` may return false when there's nothing further that way: the chart then gives a soft bump and keeps the
 *  bar picked, instead of ticking as if it paged. `describe`: what VoiceOver reads for a bar (default: its label and
 *  amount). */
export function BarChart({ bars, color, average, selected, onSelect, onPage, labelEvery = 1, describe }: {
  bars: BarDatum[]; color: string; average?: number; selected: number | null; onSelect: (i: number | null) => void
  onPage?: (dir: -1 | 1) => boolean | void; labelEvery?: number; describe?: (i: number) => string
}) {
  const p = usePalette()
  const [w, setW] = useState(0)
  const { max, grid } = barScale(bars.map((b) => b.value), H, average ?? 0)
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
  const page = (dir: -1 | 1) => {
    if (!onPage) return
    if (onPage(dir) === false) { soft(); return }
    tick(); onSelect(null)
  }

  const scrub = Gesture.Pan().activateAfterLongPress(160)
    .onStart((e) => { scheduleOnRN(pickAt, e.x) })
    .onUpdate((e) => { scheduleOnRN(pickAt, e.x) })
  const tap = Gesture.Tap().maxDuration(250).onEnd((e) => { scheduleOnRN(tapAt, e.x) })
  const older = Gesture.Fling().direction(Directions.RIGHT).onEnd(() => { scheduleOnRN(page, -1) })
  const newer = Gesture.Fling().direction(Directions.LEFT).onEnd(() => { scheduleOnRN(page, 1) })
  const gesture = Gesture.Race(scrub, Gesture.Exclusive(older, newer), tap)

  const say = (i: number) => {
    const b = bars[i]
    if (!b) return ''
    return describe ? describe(i) : `${b.label}, ${b.future ? 'not yet' : formatCents(Number.isFinite(b.value) ? b.value : 0, { cents: false })}`
  }
  const step = (d: -1 | 1) => {
    if (!bars.length) return
    const i = Math.max(0, Math.min(bars.length - 1, (selected ?? (d > 0 ? -1 : bars.length)) + d))
    if (i !== selected) { tick(); onSelect(i) }
  }
  const avg = average !== undefined && Number.isFinite(average) && average > 0 ? average : null
  const avgY = avg !== null ? H - (avg / max) * H : null
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="adjustable" accessibilityLabel="Chart"
      accessibilityValue={{ text: selected !== null ? say(selected) : avg !== null ? `Average ${formatCents(avg, { cents: false })}` : `${bars.length} bars` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
      <View style={{ height: H }}>
        {/* The grid and its scale on the right, as Health draws them: each line exactly at its value, its label just
            under it (the zero line's under the baseline). */}
        {grid.map((g) => (
          <View key={g.value} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: g.y - 0.25, height: 0.5,
            backgroundColor: g.value === 0 ? p.separator : p.fill3 }} />
        ))}
        {grid.map((g) => (
          <Txt key={`l${g.value}`} v="caption2" tone="label2" num numberOfLines={1}
            style={{ position: 'absolute', right: 0, width: SCALE_W, paddingLeft: 6, top: g.y + 2 }}>{g.label}</Txt>
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
