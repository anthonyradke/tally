// The category switcher from Mail: a row of round buttons where the chosen one widens into a colored capsule with its
// name, and the others narrow to their symbol. The capsules glide to their new widths together and settle without
// overshooting; the name fades in once there's room for it. As in Mail, a swipe across the bar jumps to the far end
// (left goes to the last one, right to the first), and a tap picks any of them.
import { startTransition, useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import type { SFSymbol } from 'expo-symbols'
import { tick } from '../haptics'
import { EASE, fadeIn, fadeOut, SETTLE } from '../motion'
import { deepen } from '../color'
import { usePalette, type Hue } from '../theme'
import { SF } from './SF'

export interface SwitchOption<K extends string> { key: K; label: string; symbol: SFSymbol; hue: Hue }

const H = 44

function Pill<K extends string>({ o, on, onPress }: { o: SwitchOption<K>; on: boolean; onPress: () => void }) {
  const p = usePalette()
  // The capsule's color, deepened where the bright system hue would leave its white label under 3:1 (green, the
  // dark-mode tint, yellow), the way Mail's capsules stay legible.
  const fill = deepen(o.hue === 'tint' ? p.tintFill : p[o.hue])
  const lit = useSharedValue(on ? 1 : 0)
  useEffect(() => { lit.set(withTiming(on ? 1 : 0, { duration: 220, easing: EASE })) }, [on, lit])
  const anim = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(lit.value, [0, 1], [p.fill3, fill]) }))
  return (
    <Animated.View layout={SETTLE} style={[{ height: H, borderRadius: H / 2, flexGrow: on ? 1 : 0, minWidth: 56, overflow: 'hidden' }, anim]}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label}
        onPress={onPress} hitSlop={4}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: on ? 18 : 0 }}>
        <SF name={o.symbol} size={19} color={on ? '#FFFFFF' : p.label2} weight="semibold" />
        {on && (
          <Animated.Text entering={fadeIn(90)} exiting={fadeOut} numberOfLines={1}
            style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '600' }}>{o.label}</Animated.Text>
        )}
      </Pressable>
    </Animated.View>
  )
}

export function Switcher<K extends string>({ options, value, onChange }: { options: SwitchOption<K>[]; value: K; onChange: (k: K) => void }) {
  // The bar answers at once; the screen behind it (a long list) catches up as a transition, so it never holds the
  // capsule's move back.
  const [shown, setShown] = useState(value)
  const [was, setWas] = useState(value)
  if (value !== was) { setWas(value); setShown(value) }
  const pick = (k: K) => { if (k !== shown) { tick(); setShown(k); startTransition(() => onChange(k)) } }
  const first = options[0].key, last = options[options.length - 1].key
  const swipe = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onEnd((e) => {
      if (Math.abs(e.translationX) < 30 && Math.abs(e.velocityX) < 300) return
      scheduleOnRN(pick, e.translationX < 0 ? last : first)
    })
  return (
    <GestureDetector gesture={swipe}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8 }}>
        {options.map((o) => <Pill key={o.key} o={o} on={o.key === shown} onPress={() => pick(o.key)} />)}
      </View>
    </GestureDetector>
  )
}
