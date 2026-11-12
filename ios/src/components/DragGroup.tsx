// A grouped panel whose rows reorder by dragging, the way Reminders and Settings lists do it: press and hold a row
// (or grab its handle in reorder mode) and it lifts with a shadow, the rows it passes slide out of its way with a
// tick, and letting go drops it into the gap. Held near the top or bottom of the screen, the page scrolls along.
// Everything moves on the UI thread; the new order is saved on release.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { View, useWindowDimensions, type ScrollViewProps } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  measure, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedStyle, useFrameCallback, useReducedMotion,
  useScrollViewOffset, useSharedValue, withSpring, withTiming, type AnimatedRef, type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets'
import * as Haptics from 'expo-haptics'
import { radius, space, useTheme } from '@/theme'
import { Icon } from './Icon'
import { HAIRLINE } from './Panel'
import { Txt } from './Txt'

interface Scroll {
  /** Told when a drag starts and ends, so the screen can hold its own scrolling still meanwhile. */
  lock: (dragging: boolean) => void
  ref: AnimatedRef<Animated.ScrollView> | null
  offset: SharedValue<number> | null
}
/** Provided by the screen's scroll view (see `useDragScroll`), so a dragged row can scroll it. */
const DragScroll = createContext<Scroll>({ lock: () => {}, ref: null, offset: null })

/** The scroll view for a screen holding drag groups: it holds still while a row is dragged, and a row held near
 *  its top or bottom edge scrolls it along. */
export function DragScrollView({ children, ...props }: Omit<ScrollViewProps, 'scrollEnabled'>) {
  const ref = useAnimatedRef<Animated.ScrollView>()
  const offset = useScrollViewOffset(ref)
  const [dragging, setDragging] = useState(false)
  const value = useMemo(() => ({ lock: setDragging, ref, offset }), [ref, offset])
  return (
    <DragScroll value={value}>
      <Animated.ScrollView ref={ref} automaticallyAdjustKeyboardInsets {...props} scrollEnabled={!dragging}>{children}</Animated.ScrollView>
    </DragScroll>
  )
}

const EST = 50 // a row's height until it has been measured
const SPRING = { damping: 30, stiffness: 340, mass: 0.8 }
const HOLD = 260 // ms of press before a row lifts
const EDGE = 80 // how close to the top or bottom of the visible page a held row starts it scrolling
const NAV = 44, TABS = 49 // the header and tab bar the page scrolls under
const SPEED = 14 // most points a frame the page scrolls, at the very edge

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

/** Records a row's measured height. It runs on the UI thread because a set from JS lands there later: several rows
 *  measured in one pass would each read the heights before the others' writes, the last write would win, and the
 *  group, which waits for every height before it shows, would stay invisible. */
function measured(heights: SharedValue<Record<string, number>>, k: string, h: number) {
  'worklet'
  const cur = heights.get()
  if (cur[k] !== h) heights.set({ ...cur, [k]: h })
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
  const { lock } = useContext(DragScroll)
  const keys = items.map((x) => String(keyOf(x)))
  const sig = keys.join('\n')
  const s: Shared = {
    order: useSharedValue(keys),
    heights: useSharedValue<Record<string, number>>({}),
    active: useSharedValue<string | null>(null),
    lift: useSharedValue(0),
  }
  const box = useAnimatedRef<Animated.View>()
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

  const boxStyle = useAnimatedStyle(() => {
    const ord = s.order.get(), h = s.heights.get()
    return { height: totalOf(ord, h), opacity: ord.every((k) => h[k] !== undefined) ? 1 : 0 }
  })

  return (
    <View style={{ gap: 6 }}>
      {header && <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l }}>{header}</Txt>}
      <Animated.View ref={box} style={[{ backgroundColor: c.panel, borderRadius: radius.panel, borderCurve: 'continuous' }, boxStyle]}>
        {items.map((x, i) => {
          const k = keys[i]
          return <Item key={k} k={k} s={s} box={box} start={i * EST} handles={handles} lock={lock} dropped={dropped}>{(handle) => render(x, handle)}</Item>
        })}
      </Animated.View>
      {footer && <Txt variant="foot" tone="label2" style={{ paddingHorizontal: space.l, lineHeight: 16 }}>{footer}</Txt>}
    </View>
  )
}

function Item({ k, s, box, start, handles, lock, dropped, children }: {
  k: string; s: Shared; box: AnimatedRef<Animated.View>; start: number; handles: boolean
  lock: (on: boolean) => void; dropped: (order: string[]) => void; children: (handle: ReactNode) => ReactNode
}) {
  const { c } = useTheme()
  const reduce = useReducedMotion()
  const y = useSharedValue(start)
  const from = useSharedValue(0)
  const mine = useSharedValue(false)
  const dy = useSharedValue(0)       // the finger's travel
  const finger = useSharedValue(0)   // the finger's height on screen
  const scrolled = useSharedValue(0) // how far the page has scrolled along since the lift
  const startOffset = useSharedValue(0)
  const groupTop = useSharedValue(0) // the group's top on screen at the lift
  const scroll = useContext(DragScroll)
  const insets = useSafeAreaInsets()
  const { height: screenH } = useWindowDimensions()
  const vTop = insets.top + NAV, vBot = screenH - insets.bottom - TABS

  // Slide to this row's slot whenever the order or a height changes; only while something is being dragged does
  // it glide (a fresh list or a measurement just lands).
  useAnimatedReaction(() => topOf(s.order.get(), s.heights.get(), k), (t) => {
    if (s.active.get() === k) return
    y.set(s.active.get() !== null && !reduce ? withSpring(t, SPRING) : t)
  })

  const lifted = () => { lock(true); frame.setActive(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}) }
  const tick = () => { Haptics.selectionAsync().catch(() => {}) }

  const begin = (fy: number) => {
    'worklet'
    if (s.active.get() !== null && s.active.get() !== k) return
    mine.set(true)
    s.active.set(k)
    from.set(y.get())
    dy.set(0)
    finger.set(fy)
    scrolled.set(0)
    startOffset.set(scroll.offset?.get() ?? 0)
    groupTop.set(measure(box)?.pageY ?? 0)
    s.lift.set(reduce ? 1 : withTiming(1, { duration: 160 }))
    scheduleOnRN(lifted)
  }
  // Puts the row under the finger (allowing for the page scrolled along) and works out the slot it's over.
  const place = () => {
    'worklet'
    const ord = s.order.get(), h = s.heights.get()
    const tall = h[k] ?? EST
    const ny = Math.min(Math.max(from.get() + dy.get() + scrolled.get(), 0), totalOf(ord, h) - tall)
    y.set(ny)
    // The slot whose middle the row's middle has passed (pressed against the top, it takes the first slot).
    const mid = ny + tall / 2
    const rest = ord.filter((x) => x !== k)
    let at = rest.length, acc = 0
    for (let i = 0; i < rest.length; i++) {
      const hh = h[rest[i]] ?? EST
      if (mid <= acc + hh / 2) { at = i; break }
      acc += hh
    }
    if (at !== ord.indexOf(k)) {
      rest.splice(at, 0, k)
      s.order.set(rest)
      scheduleOnRN(tick)
    }
  }
  const move = (ty: number, fy: number) => {
    'worklet'
    if (!mine.get()) return
    dy.set(ty)
    finger.set(fy)
    place()
  }
  // Each frame while held: near an edge, scroll the page toward the part of the group out of sight, faster the
  // closer the finger, and never past the group's own ends.
  const frame = useFrameCallback((f) => {
    'worklet'
    if (!mine.get() || !scroll.ref) return
    const fy = finger.get()
    const top = groupTop.get() - scrolled.get()
    const bottom = top + totalOf(s.order.get(), s.heights.get())
    const pace = Math.min((f.timeSincePreviousFrame ?? 16) / 16.7, 3)
    const speed = (d: number) => (1 + Math.min(d, 1) ** 2 * (SPEED - 1)) * pace
    let step = 0
    if (fy < vTop + EDGE && top < vTop) step = -Math.min(speed((vTop + EDGE - fy) / EDGE), vTop - top)
    else if (fy > vBot - EDGE && bottom > vBot) step = Math.min(speed((fy - vBot + EDGE) / EDGE), bottom - vBot)
    if (step === 0) return
    scrolled.set(scrolled.get() + step)
    scrollTo(scroll.ref, 0, startOffset.get() + scrolled.get(), false)
    place()
  }, false)
  const stop = () => frame.setActive(false)

  const end = () => {
    'worklet'
    if (!mine.get()) return
    mine.set(false)
    scheduleOnRN(stop)
    const t = topOf(s.order.get(), s.heights.get(), k)
    s.lift.set(reduce ? 0 : withTiming(0, { duration: 220 }))
    const settle = () => { 'worklet'; if (s.active.get() === k) s.active.set(null) }
    if (reduce) { y.set(t); settle() } else y.set(withSpring(t, SPRING, settle))
    scheduleOnRN(dropped, s.order.get())
  }

  const hold = Gesture.Pan().activateAfterLongPress(HOLD)
    .onStart((e) => begin(e.absoluteY)).onUpdate((e) => move(e.translationY, e.absoluteY)).onFinalize(end)
  // The handle lifts the row at the first touch, before the scroll view can claim the drag.
  const grab = Gesture.Pan().manualActivation(true)
    .onTouchesDown((_e, m) => { m.activate() })
    .onStart((e) => begin(e.absoluteY)).onUpdate((e) => move(e.translationY, e.absoluteY)).onFinalize(end)

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
        onLayout={(e) => scheduleOnUI(measured, s.heights, k, e.nativeEvent.layout.height)}>
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
