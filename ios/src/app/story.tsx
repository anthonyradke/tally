// A month's story: full-screen pages, one fact each, like stories in a social app. Bars at the top fill as each page
// plays; tap the right side for the next, the left for the one before, hold anywhere to pause, swipe down or tap X to
// close. Opened from the month in review on Home and from a finished month in Insights.
import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import { StatusBar } from 'expo-status-bar'
import * as Haptics from 'expo-haptics'
import { Confetti } from '@/components/Confetti'
import { Icon } from '@/components/Icon'
import { StoryControls, storyPages, type Page } from '@/components/StoryPages'
import { Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { useTransactions } from '@/lib/data'
import { lastOfMonth, monthOf } from '@/lib/dates'
import { close } from '@/lib/nav'
import { play } from '@/lib/sound'
import { buildStory } from '@/lib/story'
import { useTally } from '@/lib/tally'
import { space } from '@/theme'

const PAGE_MS = 6500

export default function StoryRoute() {
  const params = useLocalSearchParams<{ month?: string }>()
  const t = useTally()
  const b = t.b
  const month = params.month ?? (b ? monthOf(b.today) : '')
  const q = useTransactions({ start: month, end: month ? lastOfMonth(month) : undefined, limit: 5000 }, !!month)
  const pages = useMemo(() => {
    if (!b || !q.data) return null
    const s = buildStory(b, month, q.data.items)
    return s ? storyPages(s, { markFor: t.markFor, today: b.today }) : []
  }, [b, q.data, month, t.markFor])
  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <StatusBar style="light" />
      {pages && pages.length > 0 ? <Player pages={pages} /> : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.l }}>
          <Txt variant="headline" style={{ color: '#FFFFFF' }}>{pages ? 'Nothing to tell about that month yet.' : ' '}</Txt>
          <CloseButton />
        </View>
      )}
    </View>
  )
}

function Player({ pages }: { pages: Page[] }) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  const [party, setParty] = useState(0)
  const p = useSharedValue(0) // the current page's progress, 0..1
  const paused = useSharedValue(0)
  const drag = useSharedValue(0)

  const go = (to: number, by: 'tap' | 'auto') => {
    if (to >= pages.length) { close(); return }
    const n = Math.max(0, to)
    if (by === 'tap') { Haptics.selectionAsync().catch(() => {}); play('swoosh', 0.5) }
    if (n !== i && pages[n].celebrate) { setParty((x) => x + 1); play('success') }
    setI(n)
  }
  // Each page plays for PAGE_MS from wherever its bar is, then moves on by itself.
  const run = (from: number) => {
    p.set(from)
    p.set(withTiming(1, { duration: PAGE_MS * (1 - from), easing: Easing.linear }, (ok) => { if (ok) scheduleOnRN(go, i + 1, 'auto') }))
  }
  useEffect(() => {
    run(0)
    return () => cancelAnimation(p)
  }, [i]) // eslint-disable-line react-hooks/exhaustive-deps

  const pause = () => { paused.set(1); cancelAnimation(p) }
  const resume = () => { if (paused.get()) { paused.set(0); run(p.get()) } }

  const { width } = useWindowDimensions()
  // Taps on the bars and X up top, and anywhere on the last page (it has its own buttons), are left to the buttons:
  // a page turn on top of Done would close twice.
  const top = insets.top + 60
  const tap = Gesture.Tap().maxDuration(260).enabled(i < pages.length - 1)
    .onEnd((e, ok) => { if (ok && e.y > top) scheduleOnRN(go, e.x < width * 0.3 ? i - 1 : i + 1, 'tap') })
  const hold = Gesture.LongPress().minDuration(220).onStart(() => scheduleOnRN(pause)).onFinalize(() => scheduleOnRN(resume))
  const swipe = Gesture.Pan().activeOffsetY(14).failOffsetX([-30, 30])
    .onStart(() => scheduleOnRN(pause))
    .onUpdate((e) => drag.set(Math.max(0, e.translationY)))
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) scheduleOnRN(close)
      else { drag.set(withSpring(0, { damping: 20, stiffness: 240 })); scheduleOnRN(resume) }
    })
  const gesture = Gesture.Race(swipe, Gesture.Exclusive(hold, tap))
  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: drag.get() }, { scale: 1 - Math.min(drag.get() / height, 0.5) * 0.15 }],
    borderRadius: Math.min(drag.get() / 3, 32),
  }))

  return (
    <StoryControls.Provider value={{ replay: () => go(0, 'tap') }}>
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ flex: 1, overflow: 'hidden', borderCurve: 'continuous' }, sheet]}>
        {pages.map((pg, k) => <Backdrop key={pg.key} colors={pg.colors} on={k === i} reduce={!!reduce} />)}
        <View style={{ paddingTop: insets.top + space.s, paddingHorizontal: space.m, gap: space.m }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {pages.map((pg, k) => <Segment key={pg.key} state={k < i ? 1 : k > i ? 0 : -1} p={p} />)}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}><CloseButton /></View>
        </View>
        <View key={pages[i].key} style={{ flex: 1, justifyContent: 'center', paddingHorizontal: space.xxl, paddingBottom: insets.bottom + 60 }}>
          {pages[i].node}
        </View>
        <Confetti fire={party} origin={{ x: 0.5, y: 0.4 }} />
      </Animated.View>
    </GestureDetector>
    </StoryControls.Provider>
  )
}

/** One progress bar: full for pages seen, empty for pages ahead, and filling for this one. */
function Segment({ state, p }: { state: number; p: SharedValue<number> }) {
  const fill = useAnimatedStyle(() => ({ width: `${(state < 0 ? p.get() : state) * 100}%` }))
  return (
    <View style={{ flex: 1, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
      <Animated.View style={[{ height: 3, backgroundColor: '#FFFFFF' }, fill]} />
    </View>
  )
}

/** A page's color: a diagonal gradient with a soft light near the top. Pages cross-fade as you move through them. */
function Backdrop({ colors, on, reduce }: { colors: readonly [string, string]; on: boolean; reduce: boolean }) {
  const o = useSharedValue(on ? 1 : 0)
  useEffect(() => { o.set(reduce ? (on ? 1 : 0) : withTiming(on ? 1 : 0, { duration: 420 })) }, [on, reduce, o])
  const style = useAnimatedStyle(() => ({ opacity: o.get() }))
  const [a, b] = colors
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={`bg${a}${b}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={b} />
            <Stop offset="1" stopColor={a} />
          </LinearGradient>
          <RadialGradient id={`lt${a}${b}`} cx="80%" cy="10%" r="70%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.22} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#bg${a}${b})`} />
        <Rect width="100%" height="100%" fill={`url(#lt${a}${b})`} />
      </Svg>
    </Animated.View>
  )
}

function CloseButton() {
  return (
    <Tap onPress={() => close()} hitSlop={10} accessibilityLabel="Close"
      style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
      <Icon sf="xmark" md="close" size={14} color="#FFFFFF" weight="bold" />
    </Tap>
  )
}
