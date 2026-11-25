// Every tappable thing in the New design. `scale`: a control that shrinks a little under the finger and springs
// back; `highlight`: a list row that greys while held, like UITableView.
import type { ReactNode } from 'react'
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { tap } from '../haptics'
import { EASE } from '../motion'
import { springs, usePalette } from '../theme'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export function Press({ feel = 'scale', haptic = true, style, children, onPressIn, onPressOut, onPress, ...rest }:
  Omit<PressableProps, 'style' | 'children'> & { feel?: 'scale' | 'highlight' | 'none'; haptic?: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const p = usePalette()
  const down = useSharedValue(0)
  const anim = useAnimatedStyle(() => feel === 'scale'
    ? { transform: [{ scale: 1 - down.value * 0.03 }], opacity: 1 - down.value * 0.2 }
    : feel === 'highlight' ? { backgroundColor: down.value ? p.fill3 : 'transparent' } : {})
  return (
    <AnimatedPressable {...rest} style={[style, anim]}
      onPressIn={(e) => { down.set(withTiming(1, { duration: feel === 'scale' ? 90 : 40, easing: EASE })); onPressIn?.(e) }}
      onPressOut={(e) => { down.set(feel === 'scale' ? withSpring(0, springs.smooth) : withTiming(0, { duration: 240 })); onPressOut?.(e) }}
      onPress={onPress ? (e) => { if (haptic) tap(); onPress(e) } : undefined}>
      {children}
    </AnimatedPressable>
  )
}
