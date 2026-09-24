import { memo } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/theme'
import { Icon } from './Icon'
import { Txt } from './Txt'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del']

/** The amount keypad (Cash App grammar: big keys, no chrome). Digits shift in from the right, so there's no decimal
 *  point key; 00 sits in its place. A tick on every press, like the system keyboard, and the key's label pops;
 *  holding delete clears. */
export const Keypad = memo(function Keypad({ onKey, onClear }: { onKey: (k: string) => void; onClear: () => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {KEYS.map((k) => <Key key={k} k={k} onKey={onKey} onClear={onClear} />)}
    </View>
  )
})

function Key({ k, onKey, onClear }: { k: string; onKey: (k: string) => void; onClear: () => void }) {
  const { c } = useTheme()
  const reduce = useReducedMotion()
  const s = useSharedValue(1)
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }))
  return (
    <Pressable accessibilityRole="keyboardkey" accessibilityLabel={k === 'del' ? 'Delete' : k === '00' ? 'Double zero' : k}
      onPressIn={() => { if (!reduce) s.set(withTiming(0.86, { duration: 70 })) }}
      onPressOut={() => { if (!reduce) s.set(withSequence(withTiming(1.14, { duration: 90 }), withSpring(1, { damping: 12, stiffness: 320 }))) }}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onKey(k) }}
      onLongPress={k === 'del' ? () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onClear() } : undefined}
      style={{ width: '33.333%', height: 58, alignItems: 'center', justifyContent: 'center' }}>
      {({ pressed }) => (
        <View style={{ width: 72, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.fill : 'transparent' }}>
          <Animated.View style={pop}>
            {k === 'del'
              ? <Icon sf="delete.left" md="backspace" size={24} color={c.label} weight="medium" />
              : <Txt style={{ fontSize: 28, fontWeight: '500', color: c.label }}>{k}</Txt>}
          </Animated.View>
        </View>
      )}
    </Pressable>
  )
}
