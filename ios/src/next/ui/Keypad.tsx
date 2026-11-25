// The number pad for amounts, like Apple Cash's: big numerals with no keys drawn, a soft circle that blooms under
// the finger, and a tick for every press.
import { Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { tick } from '../haptics'
import { usePalette } from '../theme'
import { SF } from './SF'
import { Txt } from './Txt'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']

function Key({ k, onKey }: { k: string; onKey: (k: string) => void }) {
  const p = usePalette()
  const down = useSharedValue(0)
  const bloom = useAnimatedStyle(() => ({ opacity: down.value, transform: [{ scale: 0.85 + down.value * 0.15 }] }))
  return (
    <Pressable style={{ flex: 1, height: 58, alignItems: 'center', justifyContent: 'center' }}
      accessibilityLabel={k === '⌫' ? 'Delete' : k === '.' ? 'Decimal point' : k}
      onPressIn={() => { down.set(withTiming(1, { duration: 60 })); tick() }}
      onPressOut={() => { down.set(withTiming(0, { duration: 320 })) }}
      onPress={() => onKey(k)}>
      <Animated.View style={[{ position: 'absolute', width: 64, height: 54, borderRadius: 27, backgroundColor: p.fill3 }, bloom]} />
      {k === '⌫' ? <SF name="delete.left" size={24} color={p.label} /> : <Txt v="title1" weight="500" style={{ fontFamily: 'ui-rounded' }}>{k}</Txt>}
    </Pressable>
  )
}

export function Keypad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <View>
      {[0, 1, 2, 3].map((r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {KEYS.slice(r * 3, r * 3 + 3).map((k) => <Key key={k} k={k} onKey={onKey} />)}
        </View>
      ))}
    </View>
  )
}

/** The typed amount after a key: digits and one point, two decimals at most, seven whole digits. null: refused. */
export function typeKey(s: string, k: string): string | null {
  if (k === '⌫') return s.slice(0, -1)
  if (k === '.') return s.includes('.') ? null : (s || '0') + '.'
  const [whole, frac] = s.split('.')
  if (frac !== undefined && frac.length >= 2) return null
  if (frac === undefined && whole.length >= 7) return null
  if (s === '0') return k
  return s + k
}

export const typedCents = (s: string) => Math.round(Number(s || '0') * 100)

/** "1234.5" -> "$1,234.5": what's typed so far, as money. */
export function typedText(s: string): string {
  const [whole, frac] = s.split('.')
  const w = Number(whole || '0').toLocaleString('en-US')
  return `$${w}${frac !== undefined ? '.' + frac : ''}`
}
