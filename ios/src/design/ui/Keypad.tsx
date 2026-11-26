// The number pad for amounts, like Apple Cash's: big numerals with no keys drawn, a soft circle that blooms under
// the finger, and a tick for every key that changes the amount (a refused one gets the screen's warning instead, and
// nothing ticks once there's nothing left to delete). Holding delete keeps deleting, faster the longer it's held,
// like the keyboard's, and stops when the amount is empty.
import { useEffect, useRef } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { tick } from '../haptics'
import { usePalette } from '../theme'
import { SF } from './SF'
import { Txt } from './Txt'
import { DELETE, keyEffect } from './typing'

export { typeKey, typedCents, typedText, keyEffect } from './typing'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', DELETE]

/** Runs a key and says whether it changed anything. */
type Run = (k: string) => boolean

function Key({ k, run }: { k: string; run: Run }) {
  const p = usePalette()
  const down = useSharedValue(0)
  const bloom = useAnimatedStyle(() => ({ opacity: down.value, transform: [{ scale: 0.85 + down.value * 0.15 }] }))
  const del = k === DELETE
  // The latest handler, for the repeat: each delete re-renders the screen with a new one.
  const latest = useRef(run)
  useEffect(() => { latest.current = run }, [run])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  useEffect(() => stop, [])
  const repeat = (n: number) => {
    timer.current = setTimeout(() => { if (latest.current(DELETE)) repeat(n + 1); else timer.current = null }, n < 8 ? 95 : 45)
  }
  return (
    <Pressable style={{ flex: 1, height: 58, alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="keyboardkey" accessibilityLabel={del ? 'Delete' : k === '.' ? 'Decimal point' : k}
      onPressIn={() => {
        down.set(withTiming(1, { duration: 60 }))
        // Delete acts on touch-down (and then repeats); digits on release, so a sheet swiped down from the pad types
        // nothing. Delete still gets a no-op onPress: without one, React Native Web drops a quick tap's press-in.
        if (del) { stop(); if (run(k)) timer.current = setTimeout(() => repeat(0), 420) }
      }}
      onPressOut={() => { down.set(withTiming(0, { duration: 320 })); stop() }}
      onPress={del ? () => {} : () => { run(k) }}>
      <Animated.View style={[{ position: 'absolute', width: 64, height: 54, borderRadius: 27, backgroundColor: p.fill3 }, bloom]} />
      {del ? <SF name="delete.left" size={24} color={p.label} /> : <Txt v="title1" weight="500" style={{ fontFamily: 'ui-rounded' }}>{k}</Txt>}
    </Pressable>
  )
}

/** Two ways to use it.
 *  - Controlled: pass `value` and `onChange`; the pad types itself (`typeKey`), calls `onChange` with the new amount,
 *    `onRefuse` for a key it won't take (the screen's warning and shake), and ticks only when the amount changes.
 *    `replaceOnNext`: the next key starts a new amount (delete clears it), for an amount being edited.
 *  - By key: `onKey(k)` gets every key; return false when it changed nothing so the pad doesn't tick or repeat. Pass
 *    `value` too and the pad works that out itself (and honors `replaceOnNext` the same way when deciding). */
export function Keypad({ onKey, value, onChange, onRefuse, replaceOnNext }: {
  onKey?: (k: string) => boolean | void; value?: string; onChange?: (next: string) => void; onRefuse?: (k: string) => void; replaceOnNext?: boolean
}) {
  const run: Run = (k) => {
    if (value !== undefined) {
      const { next, changed } = keyEffect(value, k, replaceOnNext)
      if (onChange) {
        if (next === null) { onRefuse?.(k); return false }
        if (!changed) return false
        tick(); onChange(next)
        return true
      }
      if (changed) tick()
      if (next !== null && !changed) return false // nothing to delete: not even the screen hears it
      onKey?.(k)
      return changed
    }
    const ok = onKey?.(k)
    if (ok === false) return false
    tick()
    return true
  }
  return (
    <View>
      {[0, 1, 2, 3].map((r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {KEYS.slice(r * 3, r * 3 + 3).map((k) => <Key key={k} k={k} run={run} />)}
        </View>
      ))}
    </View>
  )
}
