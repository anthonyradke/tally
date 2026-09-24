// A short burst of confetti in the theme's colors, for the rare moments worth it: a reconcile that matches to the
// cent, a month that came in under budget. Bump `fire` to launch one. Reduce Motion skips it.
import { memo, useEffect, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated'
import { useTheme } from '@/theme'

const COUNT = 36
const LIFE = 1700

interface Bit { vx: number; vy: number; spin: number; w: number; h: number; color: string; delay: number }

const Piece = memo(function Piece({ t, b }: { t: SharedValue<number>; b: Bit }) {
  const style = useAnimatedStyle(() => {
    const k = Math.max(0, Math.min(1, (t.get() - b.delay) / (1 - b.delay)))
    const x = b.vx * k
    const y = b.vy * k + 520 * k * k // thrown up and out, then gravity takes it
    return {
      opacity: k === 0 || k === 1 ? 0 : k > 0.7 ? (1 - k) / 0.3 : 1,
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${b.spin * k}deg` }, { scaleY: Math.cos(k * 12 + b.spin) }],
    }
  })
  return <Animated.View style={[{ position: 'absolute', width: b.w, height: b.h, borderRadius: 1.5, backgroundColor: b.color, marginLeft: -b.w / 2 }, style]} />
})

/** A seeded generator (mulberry32), so each burst is random but rendering stays pure. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function scatter(seed: number, colors: string[]): Bit[] {
  const r = rng(seed * 7919 + 17)
  return Array.from({ length: COUNT }, (_, i) => {
    const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 0.95 // mostly up
    const v = 220 + r() * 260
    return { vx: Math.cos(a) * v, vy: Math.sin(a) * v, spin: (r() - 0.5) * 900, w: 6 + r() * 4, h: 9 + r() * 6,
      color: colors[i % colors.length], delay: r() * 0.12 }
  })
}

/** Fills its parent (absolutely) and bursts from `origin` (fractions of the parent's size, default top middle). */
export function Confetti({ fire, origin = { x: 0.5, y: 0.2 } }: { fire: number; origin?: { x: number; y: number } }) {
  const { c, tint } = useTheme()
  const reduce = useReducedMotion()
  const t = useSharedValue(0)
  const colors = [c.ink, tint('red'), tint('amber'), tint('green'), tint('blue'), tint('violet'), tint('pink'), tint('teal')]
  const key = colors.join()
  const bits = useMemo(() => scatter(fire, key.split(',')), [fire, key])
  useEffect(() => {
    if (!fire || reduce) return
    t.set(0)
    t.set(withTiming(1, { duration: LIFE, easing: Easing.linear }))
  }, [fire, reduce, t])
  if (!fire || reduce) return null
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 20 }]}>
      <View style={{ position: 'absolute', left: `${origin.x * 100}%`, top: `${origin.y * 100}%` }}>
        {bits.map((b, i) => <Piece key={`${fire}-${i}`} t={t} b={b} />)}
      </View>
    </View>
  )
}
