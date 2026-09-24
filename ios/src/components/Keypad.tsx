import { memo } from 'react'
import { Pressable, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/theme'
import { Icon } from './Icon'
import { Txt } from './Txt'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del']

/** The amount keypad (Cash App grammar: big keys, no chrome). Digits shift in from the right, so there's no decimal
 *  point key; 00 sits in its place. A tick on every press, like the system keyboard; holding delete clears. */
export const Keypad = memo(function Keypad({ onKey, onClear }: { onKey: (k: string) => void; onClear: () => void }) {
  const { c } = useTheme()
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {KEYS.map((k) => (
        <Pressable key={k} accessibilityRole="keyboardkey" accessibilityLabel={k === 'del' ? 'Delete' : k === '00' ? 'Double zero' : k}
          onPress={() => { Haptics.selectionAsync().catch(() => {}); onKey(k) }}
          onLongPress={k === 'del' ? () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onClear() } : undefined}
          style={{ width: '33.333%', height: 58, alignItems: 'center', justifyContent: 'center' }}>
          {({ pressed }) => (
            <View style={{ width: 72, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.fill : 'transparent' }}>
              {k === 'del'
                ? <Icon sf="delete.left" md="backspace" size={24} color={c.label} weight="medium" />
                : <Txt style={{ fontSize: 28, fontWeight: '500', color: c.label }}>{k}</Txt>}
            </View>
          )}
        </Pressable>
      ))}
    </View>
  )
})
