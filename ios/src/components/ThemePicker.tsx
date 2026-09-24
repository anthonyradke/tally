// Settings → Theme: a card per theme, each a small painting of the app in that theme (its background and glow, a
// panel with the chart line, category marks and a button), so you pick by looking rather than by name.
import { useEffect, useRef, type ReactNode } from 'react'
import { View, type GestureResponderEvent } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import { useThemeWash } from '@/lib/motion'
import { radius, space, THEMES, useTheme, useThemeChoice, type ThemeSpec } from '@/theme'
import { Icon } from './Icon'
import { Tap } from './Tap'
import { Txt } from './Txt'

const LINE = 'M4 44 C 18 44, 22 30, 34 30 S 50 36, 60 22 S 80 10, 92 8'
const DOTS = ['red', 'amber', 'green', 'blue', 'violet'] as const

export function ThemePicker() {
  const { c, dark } = useTheme()
  const current = useThemeChoice((s) => s.id)
  const set = useThemeChoice((s) => s.set)
  const reduce = useReducedMotion()
  const pick = (t: ThemeSpec, e: GestureResponderEvent) => {
    if (t.id === current) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    const p = dark ? t.dark : t.light
    if (!reduce) useThemeWash.getState().start(e.nativeEvent.pageX, e.nativeEvent.pageY, c.bg, p.glow?.[0] ?? p.ink)
    set(t.id)
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.m }}>
      {THEMES.map((t) => {
        const p = dark ? t.dark : t.light
        const ring = dark ? t.ring.dark : t.ring.light
        const on = t.id === current
        return (
          <Tap key={t.id} onPress={(e) => pick(t, e)} accessibilityLabel={`${t.name} theme`} accessibilityState={{ selected: on }}
            style={{ width: '48%', flexGrow: 1, gap: space.s }}>
            <Bounce on={on}>
            <View style={{ height: 150, borderRadius: radius.panel, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: p.bg,
              borderWidth: on ? 3 : 1, borderColor: on ? p.ink : p.sep, padding: on ? space.m - 2 : space.m, gap: space.s }}>
              {p.glow && (
                <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%">
                  <Defs>
                    <RadialGradient id={`${t.id}a`} cx="10%" cy="0%" rx="90%" ry="80%">
                      <Stop offset="0" stopColor={p.glow[0]} stopOpacity={dark ? 0.55 : 0.4} /><Stop offset="1" stopColor={p.glow[0]} stopOpacity={0} />
                    </RadialGradient>
                    <RadialGradient id={`${t.id}b`} cx="100%" cy="5%" rx="80%" ry="70%">
                      <Stop offset="0" stopColor={p.glow[1]} stopOpacity={dark ? 0.5 : 0.35} /><Stop offset="1" stopColor={p.glow[1]} stopOpacity={0} />
                    </RadialGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill={`url(#${t.id}a)`} />
                  <Rect width="100%" height="100%" fill={`url(#${t.id}b)`} />
                </Svg>
              )}
              <View style={{ flex: 1, borderRadius: 14, backgroundColor: p.panel, padding: space.s, justifyContent: 'flex-end' }}>
                <Svg width="100%" height={52} viewBox="0 0 96 52" preserveAspectRatio="none">
                  <Path d={LINE} stroke={p.ink} strokeWidth={3} strokeLinecap="round" fill="none" />
                </Svg>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', gap: 3 }}>
                  {DOTS.map((d) => <View key={d} style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: ring[d] }} />)}
                </View>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: p.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon sf="plus" md="add" size={14} color={p.onInk} weight="bold" />
                </View>
              </View>
            </View>
            </Bounce>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              {on && <Icon sf="checkmark.circle.fill" md="check_circle" size={16} color={p.ink} />}
              <Txt variant="headline" tone={on ? 'label' : 'label2'}>{t.name}</Txt>
            </View>
          </Tap>
        )
      })}
    </View>
  )
}

/** The card just chosen gives a little bounce. */
function Bounce({ on, children }: { on: boolean; children: ReactNode }) {
  const reduce = useReducedMotion()
  const s = useSharedValue(1)
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }))
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return } // not the card already chosen when the page opens
    if (on && !reduce) s.set(withSequence(withTiming(0.92, { duration: 90 }), withSpring(1, { damping: 8, stiffness: 240 })))
  }, [on, reduce, s])
  return <Animated.View style={style}>{children}</Animated.View>
}
