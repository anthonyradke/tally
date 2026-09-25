import { type ReactNode } from 'react'
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { router, type Href } from 'expo-router'
import { useTheme } from '@/theme'
import { Txt } from './Txt'

type Feedback = 'scale' | 'highlight' | 'opacity'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** The one pressable. Feedback runs on the UI thread (no re-render per touch), lands on press-in and eases out on
 *  release like UIKit: cards and buttons spring to .97, list rows get a highlight that fades, text links dim.
 *  List rows wait a beat before highlighting, so starting a scroll doesn't flash the row under your thumb. `href`
 *  pushes a route. */
export function Tap({ href, onPress, feedback = 'scale', style, children, ...rest }:
  Omit<PressableProps, 'style' | 'children'> & { href?: Href; feedback?: Feedback; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const { c } = useTheme()
  const reduce = useReducedMotion()
  const p = useSharedValue(0)
  const flat = StyleSheet.flatten(style)
  const base = typeof flat?.opacity === 'number' ? flat.opacity : 1 // a dimmed (disabled) look stays dimmed, and dims further while pressed
  const anim = useAnimatedStyle(() => (
    feedback === 'scale' ? { transform: [{ scale: 1 - p.get() * 0.03 }] }
    : feedback === 'opacity' ? { opacity: base * (1 - p.get() * 0.5) }
    : {}
  ))
  const hl = useAnimatedStyle(() => ({ opacity: p.get() }))
  return (
    <AnimatedPressable
      accessibilityRole="button"
      unstable_pressDelay={feedback === 'highlight' ? 60 : 0}
      {...rest}
      onPressIn={(e) => {
        p.set(feedback === 'scale' && !reduce ? withSpring(1, { damping: 30, stiffness: 600 }) : withTiming(1, { duration: feedback === 'highlight' ? 0 : 80 }))
        rest.onPressIn?.(e)
      }}
      onPressOut={(e) => {
        p.set(feedback === 'scale' && !reduce ? withSpring(0, { damping: 18, stiffness: 320 }) : withTiming(0, { duration: feedback === 'highlight' ? 280 : 160 }))
        rest.onPressOut?.(e)
      }}
      onPress={(e) => { onPress?.(e); if (href) router.push(href) }}
      style={[style, anim]}>
      {feedback === 'highlight' && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {
          backgroundColor: c.fill, borderRadius: flat?.borderRadius, borderCurve: 'continuous',
          borderTopLeftRadius: flat?.borderTopLeftRadius, borderTopRightRadius: flat?.borderTopRightRadius,
          borderBottomLeftRadius: flat?.borderBottomLeftRadius, borderBottomRightRadius: flat?.borderBottomRightRadius,
        }, hl]} />
      )}
      {children}
    </AnimatedPressable>
  )
}

/** Primary pill button in ink, the one accent. */
export function Button({ label, onPress, href, secondary, disabled, style }: { label: string; onPress?: () => void; href?: Href; secondary?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme()
  return (
    <Tap href={href} onPress={onPress} disabled={disabled}
      style={[{ height: 44, paddingHorizontal: 22, borderRadius: 999, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: secondary ? c.fill : c.ink, opacity: disabled ? 0.4 : 1 }, style]}>
      <Txt variant="headline" tone={secondary ? 'label' : 'onInk'}>{label}</Txt>
    </Tap>
  )
}
