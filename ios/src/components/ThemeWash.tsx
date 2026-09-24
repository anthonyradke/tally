// Plays over the whole app when the theme changes: the old background lingers and fades, so the new colors come up
// through it instead of snapping, and a ripple of the new accent spreads from the card that was tapped.
import { useEffect } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { useThemeWash } from '@/lib/motion'
import { EASE } from './ease'

const R = 40

export function ThemeWash() {
  const wash = useThemeWash((s) => s.wash)
  const end = useThemeWash((s) => s.end)
  const { width, height } = useWindowDimensions()
  const t = useSharedValue(0)
  useEffect(() => {
    if (!wash) return
    t.set(0)
    t.set(withTiming(1, { duration: 700, easing: EASE }, (ok) => { if (ok) scheduleOnRN(end) }))
  }, [wash, t, end])
  const reach = wash ? Math.hypot(Math.max(wash.x, width - wash.x), Math.max(wash.y, height - wash.y)) / R : 1
  const fade = useAnimatedStyle(() => ({ opacity: 0.85 * Math.max(0, 1 - t.get() * 1.6) }))
  const ripple = useAnimatedStyle(() => ({ opacity: 0.4 * (1 - t.get()), transform: [{ scale: 0.2 + t.get() * reach }] }))
  if (!wash) return null
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: wash.from }, fade]} />
      <Animated.View style={[{ position: 'absolute', left: wash.x - R, top: wash.y - R, width: R * 2, height: R * 2, borderRadius: R, backgroundColor: wash.color }, ripple]} />
    </View>
  )
}
