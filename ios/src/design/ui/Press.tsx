// Every tappable thing in the New design. `scale`: a control that shrinks a little under the finger and springs
// back; `highlight`: a list row that greys while held, like UITableView, and fades back when let go.
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { tap } from '../haptics'
import { EASE } from '../motion'
import { springs, usePalette } from '../theme'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** `onDisabledPress`: what a tap does while `disabled` (say a warning haptic); without it a disabled Press ignores
 *  taps. The caller's `style.opacity` is kept (the press fade multiplies it), so a dimmed control stays dim. */
export function Press({ feel = 'scale', haptic = true, style, children, onPressIn, onPressOut, onPress, onDisabledPress, disabled,
  accessibilityRole = 'button', accessibilityState, ...rest }:
  Omit<PressableProps, 'style' | 'children'> & { feel?: 'scale' | 'highlight' | 'none'; haptic?: boolean; style?: StyleProp<ViewStyle>
    children: ReactNode; onDisabledPress?: () => void }) {
  const p = usePalette()
  const down = useSharedValue(0)
  const base = StyleSheet.flatten(style)?.opacity
  const opacity = typeof base === 'number' ? base : 1
  const fill = p.fill3
  const anim = useAnimatedStyle(() => feel === 'scale'
    ? { transform: [{ scale: 1 - down.value * 0.03 }], opacity: opacity * (1 - down.value * 0.2) }
    : feel === 'highlight' ? { backgroundColor: interpolateColor(down.value, [0, 1], ['rgba(0,0,0,0)', fill]) } : {})
  const off = !!disabled
  const routed = off && !!onDisabledPress // a disabled control that still answers a tap (with a refusal)
  return (
    // A row waits a moment before it greys, as UIKit's do in a scroll view, so a scroll starting on it doesn't flash.
    <AnimatedPressable unstable_pressDelay={feel === 'highlight' ? 70 : undefined} {...rest} disabled={off && !routed} style={[style, anim]}
      accessibilityRole={accessibilityRole} accessibilityState={{ ...accessibilityState, disabled: off }}
      onPressIn={(e) => { if (!off) down.set(withTiming(1, { duration: feel === 'scale' ? 90 : 40, easing: EASE })); onPressIn?.(e) }}
      onPressOut={(e) => { down.set(feel === 'scale' ? withSpring(0, springs.smooth) : withTiming(0, { duration: 240, easing: EASE })); onPressOut?.(e) }}
      onPress={routed ? () => onDisabledPress!() : onPress ? (e) => { if (haptic) tap(); onPress(e) } : undefined}>
      {children}
    </AnimatedPressable>
  )
}
