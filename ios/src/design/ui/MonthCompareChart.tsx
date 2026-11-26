// This month's spending against last month's, added up day by day: the tint line runs from the 1st to today and ends
// on a dot, last month's runs gray behind it across the whole month. Press and hold, then slide, to read a day (as in
// Health, a quick swipe pages instead): a hairline and a dot on each line follow the finger, the figure above turns
// to that day with a tick for each one, and letting go returns to today. VoiceOver swipes up and down through days.
import { useEffect, useId, useMemo, useState } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { fromISO } from '@/lib/dates'
import { tick } from '../haptics'
import { EASE } from '../motion'
import { space, usePalette } from '../theme'
import { compareA11y, compareLine, compareOn, ordinal, type MonthCompare } from '../trends'
import { curve, lineScale } from './curve'
import { Rolling } from './Money'
import { Txt } from './Txt'

const H = 148 // the plot
const SCALE_W = 40 // the scale's labels on the right
const PAD = 6 // keeps the end dot inside the plot
const HOLD = 160 // ms before a touch on the plot starts reading days
const DOT = 12 // with its ring in the card's color
const TICKS = [1, 8, 15, 22, 29]

const monthLong = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'long' })
const monthShort = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'short' })

/** `data` null while the rows load: the figure shows `spent` (the month's own figure) and the plot waits. */
export function MonthCompareChart({ data, spent }: { data: MonthCompare | null; spent: number }) {
  const p = usePalette()
  const reduce = useReducedMotion()
  const fillId = `cmp${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [w, setW] = useState(0)
  const [day, setDay] = useState<number | null>(null) // the day read, 1-based; null: today
  const plotW = Math.max(0, w - SCALE_W)
  const prevColor = p.gray
  const lineColor = p.tint

  const geo = useMemo(() => {
    if (!data || plotW <= 0) return null
    const scale = lineScale([...data.cur, ...(data.prev ?? [])], H - PAD * 2)
    const X = (i: number) => (data.days <= 1 ? plotW / 2 : PAD + (i / (data.days - 1)) * (plotW - PAD * 2))
    const Y = (v: number) => PAD + scale.y(v)
    const slots = Array.from({ length: data.days }, (_, i) => X(i))
    const curY = data.cur.map(Y)
    const prevY = (data.prev ?? []).map(Y)
    const line = curve(slots.slice(0, curY.length), curY)
    const base = Y(Math.max(scale.lo, 0) === 0 ? 0 : scale.lo)
    const area = curY.length > 1 ? `${line} L${slots[curY.length - 1].toFixed(1)},${base.toFixed(1)} L${slots[0].toFixed(1)},${base.toFixed(1)} Z` : ''
    return { scale, slots, curY, prevY, line, area, prev: curve(slots.slice(0, prevY.length), prevY), grid: scale.grid.map((g) => ({ ...g, y: PAD + g.y })) }
  }, [data, plotW])

  // The finger's day as a slot index (-1: at rest), read on the UI thread so the hairline and dots keep up with it.
  const at = useSharedValue(-1)
  const last = data ? (data.prev ? data.days : data.cur.length) - 1 : -1 // the furthest day with a line to read
  const report = (i: number) => {
    if (i >= 0) tick()
    setDay(i < 0 ? null : i + 1)
  }
  const slots = geo?.slots ?? []
  const move = (x: number) => {
    'worklet'
    if (last < 0 || slots.length === 0) return
    const span = Math.max(1, plotW - PAD * 2)
    const i = Math.max(0, Math.min(last, Math.round(((x - PAD) / span) * (slots.length - 1))))
    if (i !== at.value) { at.value = i; scheduleOnRN(report, i) }
  }
  const end = () => {
    'worklet'
    if (at.value !== -1) { at.value = -1; scheduleOnRN(report, -1) }
  }
  // Waits for a short hold, so a swipe across the card still pages; once reading, the finger can wander up and down.
  const scrub = Gesture.Pan().activateAfterLongPress(HOLD)
    .onStart((e) => { move(e.x) }).onUpdate((e) => { move(e.x) }).onEnd(() => { end() }).onFinalize(() => { end() })

  // The lines draw in from the left once there's something to draw; the dot arrives as they finish.
  const drawn = useSharedValue(reduce ? 1 : 0)
  useEffect(() => {
    if (geo && drawn.value === 0) drawn.set(withTiming(1, { duration: 800, easing: EASE }))
  }, [geo, drawn])
  const reveal = useAnimatedStyle(() => ({ width: (plotW + 2) * drawn.value }), [plotW])

  const curY = geo?.curY ?? []
  const prevY = geo?.prevY ?? []
  const rule = useAnimatedStyle(() => {
    const i = at.value
    return { opacity: i < 0 ? 0 : 1, transform: [{ translateX: (slots[Math.max(0, i)] ?? 0) - 0.5 }] }
  }, [slots])
  const curDot = useAnimatedStyle(() => {
    const i = at.value
    const k = i < 0 ? curY.length - 1 : i
    const shown = k < curY.length && k >= 0 ? 1 : 0
    return { opacity: shown * interpolate(drawn.value, [0.7, 1], [0, 1], 'clamp'),
      transform: [{ translateX: (slots[Math.max(0, k)] ?? 0) - DOT / 2 }, { translateY: (curY[Math.min(Math.max(0, k), curY.length - 1)] ?? 0) - DOT / 2 }] }
  }, [slots, curY])
  const prevDot = useAnimatedStyle(() => {
    const i = at.value
    const k = Math.min(Math.max(0, i), prevY.length - 1)
    return { opacity: i < 0 || !prevY.length ? 0 : 1, transform: [{ translateX: (slots[Math.max(0, i)] ?? 0) - DOT / 2 }, { translateY: (prevY[k] ?? 0) - DOT / 2 }] }
  }, [slots, prevY])

  // What the header reads: today at rest, else the day under the finger. After today only last month has a figure,
  // shown in its gray.
  const today = data ? data.cur.length : 0
  const read = data && day !== null ? compareOn(data, day) : null
  const cur = data ? (read ? read.cur : data.cur[today - 1] ?? 0) : spent
  const prev = data ? (read ? read.prev : compareOn(data, today).prev) : null
  const past = read !== null && read.cur === null // a day still to come this month
  const prevName = data ? monthLong(data.prevMonth) : ''
  const title = !data || day === null ? 'This Month' : `${monthShort(past ? data.prevMonth : data.month)} ${day}`
  const line = !data ? ' '
    : past ? (data.prev && day! > data.prev.length ? `All of ${prevName}` : `${prevName} by the ${ordinal(day!)}`)
      : compareLine(cur ?? 0, prev, day)

  // VoiceOver: swipe up or down to step through the days, as a finger would.
  const [vo, setVo] = useState<number | null>(null)
  const voDay = vo ?? today
  const voRead = data ? compareOn(data, voDay) : null
  const voDate = data ? fromISO(voRead?.cur === null ? data.prevMonth : data.month).toLocaleDateString('en-US', { month: 'long' }) + ` ${voDay}` : ''
  const voText = !data ? '' : vo === null || vo === today ? compareA11y(data.cur[today - 1] ?? 0, compareOn(data, today).prev, null)
    : voRead?.cur === null ? `${voDate}, ${line}` : compareA11y(voRead?.cur ?? 0, voRead?.prev ?? null, voDay, voDate)
  const step = (dir: 1 | -1) => {
    if (!data || last < 0) return
    const next = Math.max(1, Math.min(last + 1, voDay + dir))
    setVo(next); tick()
    at.set(next === today ? -1 : next - 1)
    setDay(next === today ? null : next)
  }

  return (
    <View style={{ gap: space.l }}>
      <View accessible={false}>
        <Txt v="subhead" tone="label2" weight="600" num>{title}</Txt>
        <Rolling cents={past ? prev ?? 0 : cur ?? 0} v="title1" noCents instant={day !== null} color={past ? p.label2 : undefined} />
        <Txt v="subhead" tone="label2" num numberOfLines={1}>{line}</Txt>
      </View>

      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="adjustable"
        accessibilityLabel={data?.prev ? `This month and ${prevName}` : 'This month'} accessibilityValue={{ text: voText }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
        <View style={{ height: H }}>
          {/* The grid and its scale on the right, as Health and Stocks draw them. */}
          {(geo?.grid ?? []).map((g) => (
            <View key={g.value} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: g.y - 0.25, height: 0.5,
              backgroundColor: g.value === 0 ? p.separator : p.fill3 }} />
          ))}
          {(geo?.grid ?? []).map((g) => (
            <Txt key={`l${g.value}`} v="caption2" tone="label2" num numberOfLines={1}
              style={{ position: 'absolute', right: 0, width: SCALE_W, paddingLeft: 6, top: g.y + 2 }}>{g.label}</Txt>
          ))}
          <GestureDetector gesture={scrub} touchAction="pan-y" userSelect="none">
            <View collapsable={false} style={{ position: 'absolute', left: 0, top: 0, width: plotW, height: H }}>
              {geo && (
                <Animated.View pointerEvents="none" style={[{ height: H, overflow: 'hidden' }, reveal]}>
                  <Svg width={plotW} height={H}>
                    <Defs>
                      <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={lineColor} stopOpacity={0.2} />
                        <Stop offset="1" stopColor={lineColor} stopOpacity={0} />
                      </LinearGradient>
                    </Defs>
                    {geo.prev ? <Path d={geo.prev} stroke={prevColor} strokeOpacity={0.55} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
                    {geo.area ? <Path d={geo.area} fill={`url(#${fillId})`} /> : null}
                    <Path d={geo.line} stroke={lineColor} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </Animated.View>
              )}
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, height: H, left: 0, width: 1, backgroundColor: p.label3 }, rule]} />
              <Animated.View pointerEvents="none" style={[dotStyle(prevColor, p.card), prevDot]} />
              <Animated.View pointerEvents="none" style={[dotStyle(lineColor, p.card), curDot]} />
            </View>
          </GestureDetector>
        </View>
        <View style={{ height: 14, marginTop: 6, width: plotW }}>
          {data && geo && TICKS.filter((d) => d <= data.days).map((d) => (
            <Txt key={d} v="caption2" tone={day === d ? 'label' : 'label2'} weight={day === d ? '600' : '400'} num numberOfLines={1}
              style={{ position: 'absolute', width: 32, left: geo.slots[d - 1] - 16, textAlign: 'center' }}>{d}</Txt>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: space.l }} accessible={false} importantForAccessibility="no-hide-descendants">
        <Key color={lineColor} label={data ? monthLong(data.month) : ''} />
        {data?.prev && <Key color={prevColor} faint label={prevName} />}
      </View>
    </View>
  )
}

const dotStyle = (color: string, ring: string) => ({
  position: 'absolute' as const, left: 0, top: 0, width: DOT, height: DOT, borderRadius: DOT / 2,
  backgroundColor: color, borderWidth: 2.5, borderColor: ring,
})

function Key({ color, label, faint }: { color: string; label: string; faint?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 14, height: 3, borderRadius: 1.5, backgroundColor: color, opacity: faint ? 0.55 : 1 }} />
      <Txt v="footnote" tone="label2">{label}</Txt>
    </View>
  )
}
