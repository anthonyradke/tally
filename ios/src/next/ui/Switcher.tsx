// The category switcher from Mail: a row of round buttons where the chosen one stretches into a colored capsule
// with its name, and the others shrink to their symbol. The capsules slide and resize on a spring as the choice
// moves, with a little give in the one you tapped.
import { useEffect } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { FadeIn, FadeOut, interpolateColor, LinearTransition, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import type { SFSymbol } from 'expo-symbols'
import { tick } from '../haptics'
import { springs, usePalette, type Hue } from '../theme'
import { Symbol } from './Symbol'

export interface SwitchOption<K extends string> { key: K; label: string; symbol: SFSymbol; hue: Hue }

const LAYOUT = LinearTransition.springify().damping(17).stiffness(210).mass(0.8)

function Pill<K extends string>({ o, on, onPress }: { o: SwitchOption<K>; on: boolean; onPress: () => void }) {
  const p = usePalette()
  const give = useSharedValue(1)
  const lit = useSharedValue(on ? 1 : 0)
  useEffect(() => { lit.set(withSpring(on ? 1 : 0, springs.snappy)) }, [on, lit])
  const anim = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(lit.value, [0, 1], [p.fill3, p[o.hue]]),
    transform: [{ scaleX: give.value }, { scaleY: 2 - give.value }],
  }))
  return (
    <Animated.View layout={LAYOUT} style={[{ height: 40, borderRadius: 20, flexGrow: on ? 1 : 0, minWidth: 52 }, anim]}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label}
        onPress={() => { give.set(withSequence(withTiming(1.07, { duration: 90 }), withSpring(1, springs.bouncy))); onPress() }}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: on ? 16 : 0 }}>
        <Symbol name={o.symbol} size={16} color={on ? '#FFFFFF' : p.label2} weight="semibold" />
        {on && (
          <Animated.Text entering={FadeIn.duration(200).delay(70)} exiting={FadeOut.duration(70)} numberOfLines={1}
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
