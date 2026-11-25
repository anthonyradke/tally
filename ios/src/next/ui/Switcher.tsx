// The category switcher from Mail: a row of round buttons where the chosen one widens into a colored capsule with its
// name, and the others narrow to their symbol. The capsules glide to their new widths together and settle without
// overshooting; the name fades in once there's room for it.
import { useEffect } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import type { SFSymbol } from 'expo-symbols'
import { tick } from '../haptics'
import { EASE, fadeIn, fadeOut, SETTLE } from '../motion'
import { usePalette, type Hue } from '../theme'
import { SF } from './SF'

export interface SwitchOption<K extends string> { key: K; label: string; symbol: SFSymbol; hue: Hue }

function Pill<K extends string>({ o, on, onPress }: { o: SwitchOption<K>; on: boolean; onPress: () => void }) {
  const p = usePalette()
  const lit = useSharedValue(on ? 1 : 0)
  useEffect(() => { lit.set(withTiming(on ? 1 : 0, { duration: 300, easing: EASE })) }, [on, lit])
  const anim = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(lit.value, [0, 1], [p.fill3, p[o.hue]]) }))
  return (
    <Animated.View layout={SETTLE} style={[{ height: 40, borderRadius: 20, flexGrow: on ? 1 : 0, minWidth: 52 }, anim]}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label}
        onPress={onPress}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: on ? 16 : 0 }}>
        <SF name={o.symbol} size={16} color={on ? '#FFFFFF' : p.label2} weight="semibold" />
        {on && (
          <Animated.Text entering={fadeIn(120)} exiting={fadeOut} numberOfLines={1}
            style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600', letterSpacing: -0.23 }}>{o.label}</Animated.Text>
        )}
      </Pressable>
    </Animated.View>
  )
}

export function Switcher<K extends string>({ options, value, onChange }: { options: SwitchOption<K>[]; value: K; onChange: (k: K) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8 }}>
      {options.map((o) => <Pill key={o.key} o={o} on={o.key === value} onPress={() => { if (o.key !== value) { tick(); onChange(o.key) } }} />)}
    </View>
  )
}
