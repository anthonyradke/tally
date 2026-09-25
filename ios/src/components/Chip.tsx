import type { ReactNode } from 'react'
import { Pressable } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { radius, space, useTheme } from '@/theme'
import { Txt } from './Txt'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** A pill. Selected chips are ink (the one accent); the rest sit on the panel color. A leading mark hops when the chip
 *  is tapped. */
export function Chip({ label, selected, onPress, leading, onDark }: { label: string; selected?: boolean; onPress?: () => void; leading?: ReactNode; onDark?: boolean }) {
  const { c } = useTheme()
  const reduce = useReducedMotion()
  const hop = useSharedValue(0)
  const p = useSharedValue(0)
  const press = useAnimatedStyle(() => ({ transform: [{ scale: 1 - p.get() * 0.04 }] }))
  const mark = useAnimatedStyle(() => ({ transform: [{ translateY: -hop.get() * 5 }, { scale: 1 + hop.get() * 0.18 }, { rotate: `${hop.get() * -10}deg` }] }))
  return (
    <AnimatedPressable
      onPressIn={() => p.set(withSpring(1, { damping: 30, stiffness: 600 }))}
      onPressOut={() => p.set(withSpring(0, { damping: 16, stiffness: 300 }))}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {})
        if (leading && !reduce) hop.set(withSequence(withTiming(1, { duration: 110 }), withSpring(0, { damping: 9, stiffness: 260 })))
        onPress?.()
      }}
      accessibilityRole="button" accessibilityState={{ selected: !!selected }}
      style={[{
        flexDirection: 'row', alignItems: 'center', gap: space.s, height: 36, paddingLeft: leading ? space.xs : space.l, paddingRight: space.l,
        borderRadius: radius.pill, backgroundColor: selected ? c.ink : onDark ? c.fill : c.panel,
      }, press]}>
      {leading && <Animated.View style={mark}>{leading}</Animated.View>}
      <Txt variant="sub" tone={selected ? 'onInk' : 'label'} style={{ fontSize: 15, fontWeight: '600' }}>{label}</Txt>
    </AnimatedPressable>
  )
}
