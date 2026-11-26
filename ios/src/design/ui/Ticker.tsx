// A market ticker for the accounts: net worth and every account on one line, each with its balance and the month's
// move, drifting right to left on the UI thread at a calm, even pace and looping without a seam (the run is drawn
// twice or more, and the offset folds back by one run's width). A finger takes hold of it: it stops at the touch,
// follows a sideways drag, coasts out of a flick and picks up speed again a moment after letting go. A tap opens the
// account. It stands still while the screen is covered or the app is away, and with Reduce Motion or VoiceOver it's
// an ordinary row to scroll by hand.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, AppState, PixelRatio, Platform, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native'
import { useIsFocused } from 'expo-router'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useFrameCallback, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { tick } from '../haptics'
import { usePalette, type Palette } from '../theme'
import { balanceText, clock, copiesFor, FLING_FRICTION, FLING_MAX, itemAt, itemLabel, moveText, pctText, RESUME_DELAY_MS, RESUME_RAMP_MS, stripLabel, TICKER_SPEED, wrap, type TickerItem } from '../ticker'
import { Txt } from './Txt'

const HEIGHT = 38
const FADE = 20

/** `onOpen`: an account's item was tapped (net worth has no page of its own, so it isn't). */
export const Ticker = memo(function Ticker({ items, onOpen, style }: { items: TickerItem[]; onOpen: (id: number) => void; style?: StyleProp<ViewStyle> }) {
  const p = usePalette()
  const still = useStill()
  const focused = useIsFocused()
  const awake = useAwake()
  const open = useCallback((i: number) => {
    const id = items[i]?.id
    if (id == null) return
    tick()
    onOpen(id)
  }, [items, onOpen])
  if (!items.length) return null
  const hair = StyleSheet.hairlineWidth
  return (
    <View style={[{ height: HEIGHT + hair * 2, backgroundColor: p.card, borderColor: p.separator, borderTopWidth: hair, borderBottomWidth: hair }, style]}
      accessibilityLabel={stripLabel(items)}>
      {still ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: FADE / 2 }}>
          {items.map((t, i) => (
            <Pressable key={t.key} onPress={() => open(i)} disabled={t.id === null}
              accessibilityRole={t.id === null ? 'text' : 'button'} accessibilityLabel={itemLabel(t)}>
              {({ pressed }) => <Item t={t} p={p} last={i === items.length - 1} dim={pressed} />}
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Moving items={items} p={p} running={focused && awake} open={open} />
      )}
      <Fades color={p.card} />
    </View>
  )
})

function Moving({ items, p, running, open }: { items: TickerItem[]; p: Palette; running: boolean; open: (i: number) => void }) {
  const [runW, setRunW] = useState(0)
  const [band, setBand] = useState(0)
  const offset = useSharedValue(0)
  const w = useSharedValue(0)
  const speed = useSharedValue(1) // 0 while held, back to 1 after; the drift is TICKER_SPEED × this
  const fling = useSharedValue(0) // what's left of a flick, points per second, fading out
  const starts = useSharedValue<number[]>([])
  const moved = useSharedValue(0) // when the finger last moved, so a flick held still before letting go doesn't coast
  const measured = useRef<number[]>([])

  const frame = useFrameCallback((f) => {
    const dt = Math.min(f.timeSincePreviousFrame ?? 16, 64) / 1000
    const left = fling.get()
    const v = left - TICKER_SPEED * speed.get()
    if (v !== 0) offset.set(wrap(offset.get() + v * dt, w.get()))
    if (left !== 0) fling.set(Math.abs(left) < 2 ? 0 : left * Math.exp(-FLING_FRICTION * dt))
  }, false)
  useEffect(() => { frame.setActive(running && runW > 0) }, [frame, running, runW])

  const gesture = useMemo(() => {
    // Touch-down stops it where it is; the pan only takes over once the finger moves sideways, so a vertical scroll
    // that starts here stays the page's.
    const pan = Gesture.Pan().activeOffsetX([-10, 10]).failOffsetY([-8, 8])
      .onBegin(() => { cancelAnimation(speed); speed.set(0); fling.set(0) })
      .onChange((e) => { offset.set(wrap(offset.get() + e.changeX, w.get())); moved.set(clock()) })
      .onEnd((e) => { fling.set(clock() - moved.get() > 80 ? 0 : Math.max(-FLING_MAX, Math.min(FLING_MAX, e.velocityX))) })
      .onFinalize(() => {
        speed.set(withDelay(RESUME_DELAY_MS, withTiming(1, { duration: RESUME_RAMP_MS, easing: Easing.inOut(Easing.quad) })))
      })
    const tap = Gesture.Tap().maxDistance(10).onEnd((e, ok) => {
      if (!ok) return
      const i = itemAt(e.x, offset.get(), starts.get(), w.get())
      if (i >= 0) scheduleOnRN(open, i)
    })
    return Gesture.Race(pan, tap)
  }, [open, offset, w, speed, fling, starts, moved])

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }))
  const onRun = useCallback((e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width
    w.set(width)
    offset.set(wrap(offset.get(), width))
    setRunW(width)
  }, [w, offset])
  const onItem = useCallback((i: number, x: number) => {
    measured.current[i] = x
    starts.set(measured.current.slice(0, items.length))
  }, [starts, items.length])

  const copies = copiesFor(band, runW)
  return (
    <GestureDetector gesture={gesture}>
      <View style={{ height: HEIGHT, overflow: 'hidden' }} onLayout={(e) => setBand(e.nativeEvent.layout.width)}>
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, flexDirection: 'row' }, slide]}>
          {Array.from({ length: copies }, (_, c) => (
            <Run key={c} items={items} p={p} copy={c} open={open} onLayout={c === 0 ? onRun : undefined} onItem={c === 0 ? onItem : undefined} />
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  )
}

/** One pass through the items; copies after the first are there for the eye only. */
const Run = memo(function Run({ items, p, copy, open, onLayout, onItem }: {
  items: TickerItem[]; p: Palette; copy: number; open: (i: number) => void
  onLayout?: (e: LayoutChangeEvent) => void; onItem?: (i: number, x: number) => void
}) {
  const hidden = copy > 0
  return (
    <View style={{ flexDirection: 'row', flexShrink: 0 }} onLayout={onLayout} aria-hidden={hidden}
      accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}>
      {items.map((t, i) => (
        <View key={t.key} onLayout={onItem ? (e) => onItem(i, e.nativeEvent.layout.x) : undefined}
          accessible={!hidden} accessibilityRole={t.id === null ? 'text' : 'button'} accessibilityLabel={itemLabel(t)}
          accessibilityActions={t.id === null ? undefined : [{ name: 'activate' }]} onAccessibilityAction={() => open(i)}>
          <Item t={t} p={p} />
        </View>
      ))}
    </View>
  )
})

const hairline = 1 / PixelRatio.get()

/** Symbol, balance, the move: "CHASE  $8,358  ▲ $120 1.5%", then the hairline that parts it from the next. */
function Item({ t, p, last, dim }: { t: TickerItem; p: Palette; last?: boolean; dim?: boolean }) {
  const color = t.mood === 'good' ? p.green : t.mood === 'bad' ? p.red : p.label3
  const pct = pctText(t.pct)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: HEIGHT, opacity: dim ? 0.5 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 14 }}>
        <Txt v="footnote" weight="700" numberOfLines={1}>{t.symbol}</Txt>
        <Txt v="subhead" weight="500" tone="label" num numberOfLines={1}>{balanceText(t.balance)}</Txt>
        <Txt v="footnote" weight="600" num numberOfLines={1} color={color}>{moveText(t.change)}</Txt>
        {pct && <Txt v="footnote" weight="500" num numberOfLines={1} color={color}>{pct}</Txt>}
      </View>
      {!last && <View style={{ width: hairline, height: 14, backgroundColor: p.separator }} />}
    </View>
  )
}

/** Soft edges, so items slide in and out of the band instead of being cut. */
function Fades({ color }: { color: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {(['left', 'right'] as const).map((side) => (
        <Svg key={side} width={FADE} height="100%" style={{ position: 'absolute', top: 0, bottom: 0, [side]: 0 }}>
          <Defs>
            <LinearGradient id={`tickerFade${side}`} x1={side === 'left' ? 0 : 1} y1={0} x2={side === 'left' ? 1 : 0} y2={0}>
              <Stop offset={0} stopColor={color} stopOpacity={1} />
              <Stop offset={1} stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={FADE} height="100%" fill={`url(#tickerFade${side})`} />
        </Svg>
      ))}
    </View>
  )
}

/** Whether the strip should hold still: Reduce Motion is on, or VoiceOver (a moving target can't be read). */
function useStill(): boolean {
  const [still, setStill] = useState(false)
  useEffect(() => {
    let motion = false
    let reader = false
    let live = true
    const set = () => { if (live) setStill(motion || reader) }
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { motion = v; set() }).catch(() => {})
    // The web can't tell, and always answers yes.
    if (Platform.OS !== 'web') AccessibilityInfo.isScreenReaderEnabled().then((v) => { reader = v; set() }).catch(() => {})
    const a = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { motion = v; set() })
    const b = AccessibilityInfo.addEventListener('screenReaderChanged', (v) => { reader = v; set() })
    return () => { live = false; a.remove(); b.remove() }
  }, [])
  return still
}

/** Whether the app is in front (the strip rests while it's in the background). */
function useAwake(): boolean {
  const [awake, setAwake] = useState(AppState.currentState !== 'background')
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAwake(s === 'active'))
    return () => sub.remove()
  }, [])
  return awake
}
