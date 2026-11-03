// A grouped panel whose rows reorder by dragging, the way Reminders and Settings lists do it: press and hold a row
// (or grab its handle in reorder mode) and it lifts with a shadow, the rows it passes slide out of its way with a
// tick, and letting go drops it into the gap. Everything moves on the UI thread; the new order is saved on release.
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import * as Haptics from 'expo-haptics'
import { radius, space, useTheme } from '@/theme'
import { Icon } from './Icon'
import { HAIRLINE } from './Panel'
import { Txt } from './Txt'

/** Told when a drag starts and ends, so the screen can hold its scroll still meanwhile. */
export const DragLock = createContext<(dragging: boolean) => void>(() => {})

const EST = 50 // a row's height until it has been measured
const SPRING = { damping: 30, stiffness: 340, mass: 0.8 }
const HOLD = 260 // ms of press before a row lifts

interface Shared {
  order: SharedValue<string[]>
  heights: SharedValue<Record<string, number>>
  active: SharedValue<string | null>
  lift: SharedValue<number>
}

function topOf(order: string[], heights: Record<string, number>, key: string) {
  'worklet'
  let y = 0
  for (const k of order) { if (k === key) return y; y += heights[k] ?? EST }
  return y
}

function totalOf(order: string[], heights: Record<string, number>) {
  'worklet'
  let y = 0
  for (const k of order) y += heights[k] ?? EST
  return y
}

export function DragGroup<T>({ items, keyOf, render, onReorder, header, footer, handles = false }: {
  items: T[]; keyOf: (x: T) => string | number
  /** Draws one row; `handle` is the grab handle (null unless `handles`), for the row's trailing slot. */
  render: (x: T, handle: ReactNode) => ReactNode
  /** Saves the new order; a refusal (false) puts the rows back. */
  onReorder: (items: T[]) => Promise<boolean>
  header?: string; footer?: string; handles?: boolean
}) {
  const { c } = useTheme()
  const lock = useContext(DragLock)
  const keys = items.map((x) => String(keyOf(x)))
  const sig = keys.join('\n')
  const s: Shared = {
    order: useSharedValue(keys),
    heights: useSharedValue<Record<string, number>>({}),
    active: useSharedValue<string | null>(null),
    lift: useSharedValue(0),
  }
  const latest = useRef({ items, keys })
  useEffect(() => { latest.current = { items, keys } })

  // The list changed underneath (a save landed, a row was added): follow it, unless a row is in the air.
  const { order, active } = s
  useEffect(() => { if (active.get() === null) order.set(sig ? sig.split('\n') : []) }, [sig, order, active])

  const dropped = (next: string[]) => {
    lock(false)
    const { items: now, keys: was } = latest.current
    if (next.join('\n') === was.join('\n')) return
    const byKey = new Map(now.map((x) => [String(keyOf(x)), x]))
    const list = next.map((k) => byKey.get(k)).filter((x): x is T => x !== undefined)
    onReorder(list).then((ok) => { if (!ok) order.set(latest.current.keys) })
  }

  const box = useAnimatedStyle(() => {
    const ord = s.order.get(), h = s.heights.get()
    return { height: totalOf(ord, h), opacity: ord.every((k) => h[k] !== undefined) ? 1 : 0 }
  })

  return (
    <View style={{ gap: 6 }}>
      {header && <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l }}>{header}</Txt>}
      <Animated.View style={[{ backgroundColor: c.panel, borderRadius: radius.panel, borderCurve: 'continuous' }, box]}>
        {items.map((x, i) => {
          const k = keys[i]
          return <Item key={k} k={k} s={s} start={i * EST} handles={handles} lock={lock} dropped={dropped}>{(handle) => render(x, handle)}</Item>
        })}
      </Animated.View>
      {footer && <Txt variant="foot" tone="label2" style={{ paddingHorizontal: space.l, lineHeight: 16 }}>{footer}</Txt>}
    </View>
  )
}

function Item({ k, s, start, handles, lock, dropped, children }: {
  k: string; s: Shared; start: number; handles: boolean
  lock: (on: boolean) => void; dropped: (order: string[]) => void; children: (handle: ReactNode) => ReactNode
}) {
  const { c } = useTheme()
  const reduce = useReducedMotion()
  const y = useSharedValue(start)
  const from = useSharedValue(0)
  const mine = useSharedValue(false)

  // Slide to this row's slot whenever the order or a height changes; only while something is being dragged does
  // it glide (a fresh list or a measurement just lands).
  useAnimatedReaction(() => topOf(s.order.get(), s.heights.get(), k), (t) => {
    if (s.active.get() === k) return
    y.set(s.active.get() !== null && !reduce ? withSpring(t, SPRING) : t)
  })

  const lifted = () => { lock(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}) }
  const tick = () => { Haptics.selectionAsync().catch(() => {}) }

  const begin = () => {
    'worklet'
    if (s.active.get() !== null && s.active.get() !== k) return
    mine.set(true)
    s.active.set(k)
    from.set(y.get())
    s.lift.set(reduce ? 1 : withTiming(1, { duration: 160 }))
    scheduleOnRN(lifted)
  }
  const move = (dy: number) => {
    'worklet'
    if (!mine.get()) return
    const ord = s.order.get(), h = s.heights.get()
    const tall = h[k] ?? EST
    const ny = Math.min(Math.max(from.get() + dy, 0), totalOf(ord, h) - tall)
    y.set(ny)
    // The slot whose middle the row's middle has passed.
    const mid = ny + tall / 2
    const rest = ord.filter((x) => x !== k)
    let at = rest.length, acc = 0
    for (let i = 0; i < rest.length; i++) {
      const hh = h[rest[i]] ?? EST
      if (mid < acc + hh / 2) { at = i; break }
      acc += hh
    }
    if (at !== ord.indexOf(k)) {
      rest.splice(at, 0, k)
      s.order.set(rest)
      scheduleOnRN(tick)
    }
  }
  const end = () => {
    'worklet'
    if (!mine.get()) return
    mine.set(false)
    const t = topOf(s.order.get(), s.heights.get(), k)
    s.lift.set(reduce ? 0 : withTiming(0, { duration: 220 }))
    const settle = () => { 'worklet'; if (s.active.get() === k) s.active.set(null) }
    if (reduce) { y.set(t); settle() } else y.set(withSpring(t, SPRING, settle))
    scheduleOnRN(dropped, s.order.get())
  }

  const hold = Gesture.Pan().activateAfterLongPress(HOLD)
    .onStart(begin).onUpdate((e) => move(e.translationY)).onFinalize(end)
  // The handle lifts the row at the first touch, before the scroll view can claim the drag.
  const grab = Gesture.Pan().manualActivation(true)
    .onTouchesDown((_e, m) => { m.activate() })
    .onStart(begin).onUpdate((e) => move(e.translationY)).onFinalize(end)

  const row = useAnimatedStyle(() => {
    const on = s.active.get() === k
    const l = on ? s.lift.get() : 0
    return { transform: [{ translateY: y.get() }, { scale: 1 + l * 0.03 }], zIndex: on ? 10 : 0 }
  })
  const card = useAnimatedStyle(() => {
    const l = s.active.get() === k ? s.lift.get() : 0
    return { opacity: l, shadowOpacity: l * 0.2 }
  })
  const line = useAnimatedStyle(() => {
    const i = s.order.get().indexOf(k)
    const a = s.active.get()
    const above = i > 0 ? s.order.get()[i - 1] : null
    return { opacity: i > 0 && a !== k && a !== above ? 1 : 0 }
  })

  const handle = handles ? (
    <GestureDetector gesture={grab}>
      <View accessibilityLabel="Drag to reorder" hitSlop={10} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginRight: -6 }}>
        <Icon sf="line.3.horizontal" md="drag_handle" size={17} color={c.label3} weight="medium" />
      </View>
    </GestureDetector>
  ) : null

  return (
    <GestureDetector gesture={hold}>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, row]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height
          if (s.heights.get()[k] !== h) s.heights.set({ ...s.heights.get(), [k]: h })
        }}>
        <Animated.View pointerEvents="none" style={[{
          position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: c.panel, borderRadius: 14, borderCurve: 'continuous',
          shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowRadius: 18,
        }, card]} />
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: space.l, right: 0, height: HAIRLINE, backgroundColor: c.sep }, line]} />
        {children(handle)}
      </Animated.View>
    </GestureDetector>
  )
}
