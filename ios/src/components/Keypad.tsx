import { memo } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/theme'
import { Icon } from './Icon'
import { Txt } from './Txt'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del']

/** The amount keypad (Cash App grammar, Venmo's solid keys). Digits shift in from the right, so there's no decimal
 *  point key; 00 sits in its place. A tick on every press, like the system keyboard, and the key's label pops;
 *  holding delete clears. The keys stretch to fill whatever height the keypad is given. */
export const Keypad = memo(function Keypad({ onKey, onClear }: { onKey: (k: string) => void; onClear: () => void }) {
  return (
    <View style={{ flex: 1, gap: 8 }}>
      {[0, 3, 6, 9].map((i) => (
        <View key={i} style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
          {KEYS.slice(i, i + 3).map((k) => <Key key={k} k={k} onKey={onKey} onClear={onClear} />)}
        </View>
      ))}
    </View>
  )
})

function Key({ k, onKey, onClear }: { k: string; onKey: (k: string) => void; onClear: () => void }) {
  const { c } = useTheme()
  const reduce = useReducedMotion()
  const s = useSharedValue(1)
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }))
  const hl = useSharedValue(0)
  const well = useAnimatedStyle(() => ({ opacity: hl.get() }))
  return (
    <Pressable accessibilityRole="keyboardkey" accessibilityLabel={k === 'del' ? 'Delete' : k === '00' ? 'Double zero' : k}
      onPressIn={() => { hl.set(withTiming(1, { duration: 40 })); if (!reduce) s.set(withTiming(0.86, { duration: 70 })) }}
      onPressOut={() => { hl.set(withTiming(0, { duration: 260 })); if (!reduce) s.set(withSequence(withTiming(1.14, { duration: 90 }), withSpring(1, { damping: 12, stiffness: 320 }))) }}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onKey(k) }}
      onLongPress={k === 'del' ? () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onClear() } : undefined}
      style={{ flex: 1, minHeight: 48, maxHeight: 84, borderRadius: 999, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.fill }, well]} />
      <Animated.View style={pop}>
        {k === 'del'
          ? <Icon sf="delete.left" md="backspace" size={24} color={c.label} weight="medium" />
          : <Txt style={{ fontSize: 28, fontWeight: '500', color: c.label }}>{k}</Txt>}
      </Animated.View>
    </Pressable>
  )
}
