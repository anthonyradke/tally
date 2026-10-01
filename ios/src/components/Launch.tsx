// The launch moment, played once over the app on a cold start: the t from the app icon writes itself (the stem runs
// down into its curl, then the bar strikes across like a tally stroke), a glow blooms behind it, and it lifts away to
// show the app. It wears the colors of the app icon picked in Settings, or the theme's when the icon is the app's own.
// The native splash under it is a plain background, so nothing shows before the letter starts.
import { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import * as SplashScreen from 'expo-splash-screen'
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useAppIcon } from '@/lib/appIcon'
import { themeById, useTheme } from '@/theme'
import { EASE } from './ease'

const APath = Animated.createAnimatedComponent(Path)

// The letter from scripts/app-icons.mjs, in its 1024 space, with the lengths of its two strokes.
const STEM = 'M460 230V670Q460 800 580 800Q660 800 700 720'
const BAR = 'M340 400H620'
const STEM_LEN = 796
const BAR_LEN = 280
const STROKE = 130
const BOX = { x: 255, y: 145, w: 530, h: 740 } // the ink plus a little air
const H = 132
const W = (H * BOX.w) / BOX.h
const GLOW = 340
const DEV: readonly [string, string] = ['#FFB340', '#FF6A00']
const WRITE = Easing.bezier(0.45, 0, 0.25, 1)

/** The letter's two colors: the picked app icon's ("OceanBlack" → Ocean), else the theme's glow, else plain ink. */
function useColors(): readonly [string, string] {
  const { c, dark, theme } = useTheme()
  const icon = useAppIcon((s) => s.name)
  const id = icon ? icon.replace(/(Black|White)$/, '').toLowerCase() : theme
  if (id === 'dev') return DEV
  const spec = themeById(id)
  return (dark ? spec.dark : spec.light).glow ?? [c.ink, c.ink]
}

export function Launch({ onDone }: { onDone: () => void }) {
  const { c } = useTheme()
  const [a, b] = useColors()
  const reduce = useReducedMotion()
  const stem = useSharedValue(reduce ? 1 : 0)
  const bar = useSharedValue(reduce ? 1 : 0)
  const glow = useSharedValue(reduce ? 1 : 0)
  const scale = useSharedValue(1)
  const out = useSharedValue(0)
  const started = useRef(false)

  // Starts once this is on screen and the native splash has let go, so the first stroke isn't spent behind it.
  const start = () => {
    if (started.current) return
    started.current = true
    SplashScreen.hideAsync().catch(() => {})
    const leave = (delay: number, ms: number) => out.set(withDelay(delay, withTiming(1, { duration: ms, easing: EASE }, (ok) => { if (ok) scheduleOnRN(onDone) })))
    if (reduce) { leave(450, 220); return }
    stem.set(withDelay(80, withTiming(1, { duration: 520, easing: WRITE })))
    bar.set(withDelay(430, withTiming(1, { duration: 240, easing: EASE })))
    glow.set(withDelay(430, withTiming(1, { duration: 520, easing: EASE })))
    scale.set(withDelay(600, withSequence(withTiming(1.07, { duration: 130, easing: EASE }), withSpring(1, { damping: 11, stiffness: 240 }))))
    leave(1020, 340)
  }
  // If layout never reports (it always has), still let the app through.
  useEffect(() => { const id = setTimeout(start, 400); return () => clearTimeout(id) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stemProps = useAnimatedProps(() => ({ strokeDashoffset: (STEM_LEN + 2) * (1 - stem.get()), opacity: stem.get() > 0.001 ? 1 : 0 }))
  const barProps = useAnimatedProps(() => ({ strokeDashoffset: (BAR_LEN + 2) * (1 - bar.get()), opacity: bar.get() > 0.001 ? 1 : 0 }))
  const cover = useAnimatedStyle(() => ({ opacity: 1 - out.get() }))
  const letter = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() * (1 + out.get() * 0.35) }] }))
  const bloom = useAnimatedStyle(() => ({ opacity: glow.get() * 0.55, transform: [{ scale: 0.6 + glow.get() * 0.4 + out.get() * 0.5 }] }))

  return (
    <Animated.View onLayout={start} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }, cover]}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: GLOW, height: GLOW }, bloom]}>
        <Svg width={GLOW} height={GLOW}>
          <Defs>
            <RadialGradient id="bloom" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={b} stopOpacity={0.9} />
              <Stop offset="0.45" stopColor={a} stopOpacity={0.3} />
              <Stop offset="1" stopColor={a} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={GLOW} height={GLOW} fill="url(#bloom)" />
        </Svg>
      </Animated.View>
      <Animated.View style={letter}>
        <View style={{ width: W, height: H }}>
          <Svg width={W} height={H} viewBox={`${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}`}>
            <Defs>
              {/* In the letter's own space: a box-relative gradient has no height to work with on the flat bar. */}
              <LinearGradient id="ink" gradientUnits="userSpaceOnUse" x1={BOX.x} y1={BOX.y} x2={BOX.x + BOX.w} y2={BOX.y + BOX.h}>
                <Stop offset="0" stopColor={a} />
                <Stop offset="1" stopColor={b} />
              </LinearGradient>
            </Defs>
            <APath d={STEM} stroke="url(#ink)" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none"
              strokeDasharray={STEM_LEN + 2} animatedProps={stemProps} />
            <APath d={BAR} stroke="url(#ink)" strokeWidth={STROKE} strokeLinecap="round" fill="none"
              strokeDasharray={BAR_LEN + 2} animatedProps={barProps} />
          </Svg>
        </View>
      </Animated.View>
    </Animated.View>
  )
}
