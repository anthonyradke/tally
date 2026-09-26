import { useEffect, type ReactNode } from 'react'
import { router } from 'expo-router'
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import type { UseQueryResult } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import { useServer } from '@/lib/server'
import { radius, space, useTheme } from '@/theme'
import { Icon } from './Icon'
import { Txt } from './Txt'

/** A block the shape of what's coming. Pulses gently unless Reduce Motion is on. */
export function Skel({ w, h, r = 8, style }: { w: number | `${number}%`; h: number; r?: number; style?: object }) {
  const { c } = useTheme()
  const reduce = useReducedMotion()
  const o = useSharedValue(1)
  useEffect(() => { if (!reduce) o.set(withRepeat(withTiming(0.55, { duration: 900 }), -1, true)) }, [o, reduce])
  const a = useAnimatedStyle(() => ({ opacity: o.get() }))
  return <Animated.View style={[{ width: w, height: h, borderRadius: r, backgroundColor: c.fill }, a, style]} />
}

/** Content that replaces a skeleton fades up over it instead of snapping in. `on` is false when the data was already
 *  there on the first frame (the usual case, thanks to the cache), and then nothing moves. */
export function Arrive({ on, children, style }: { on: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion()
  const k = useSharedValue(on && !reduce ? 0 : 1)
  useEffect(() => {
    if (k.get() < 1) k.set(withTiming(1, { duration: 300 }, (ok) => { if (!ok) k.set(1) }))
  }, [k])
  const a = useAnimatedStyle(() => ({ opacity: k.get(), transform: [{ translateY: (1 - k.get()) * 8 }] }))
  return <Animated.View style={[a, style]}>{children}</Animated.View>
}

/** First-load skeleton for panel screens, and the error state when Tally can't be reached. */
export function StateView({ q, shape = 'home' }: { q: UseQueryResult<unknown>; shape?: 'home' | 'list' }) {
  const { c } = useTheme()
  const url = useServer((s) => s.url)
  if (q.isError) {
    const refused = q.error instanceof ApiError && q.error.status < 500
    return (
      <View style={{ alignItems: 'center', paddingTop: 80, paddingHorizontal: space.xxl, gap: space.m }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' }}>
          <Icon sf={refused ? 'exclamationmark.triangle' : 'wifi.slash'} md={refused ? 'warning' : 'wifi_off'} size={24} color={c.label} />
        </View>
        <Txt variant="title2" style={{ textAlign: 'center' }}>{refused ? 'Tally had a problem' : "Can't reach Tally"}</Txt>
        <Txt variant="callout" tone="label2" style={{ textAlign: 'center' }}>
          {refused ? String((q.error as Error).message) : url ? 'Tally lives on x1 and is only reachable over Tailscale. Check that Tailscale is on, then try again.' : 'No server set. Add Tally’s address in Settings.'}
        </Txt>
        <Pressable onPress={() => q.refetch()} style={({ pressed }) => ({ marginTop: space.s, height: 44, paddingHorizontal: space.xxl, borderRadius: radius.pill, backgroundColor: c.ink, justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
          <Txt variant="headline" tone="onInk">Try again</Txt>
        </Pressable>
        <Pressable onPress={() => router.push('/settings/server')} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: space.s })}>
          <Txt variant="callout" style={{ fontWeight: '600' }}>Server settings</Txt>
        </Pressable>
        {!!url && <Txt variant="foot" tone="label2" selectable>{url}</Txt>}
      </View>
    )
  }
  if (shape === 'list') {
    return (
      <View style={{ gap: space.m }}>
        {[0, 1, 2].map((g) => (
          <View key={g} style={{ gap: space.s }}>
            <Skel w={90} h={14} style={{ marginLeft: space.xs }} />
            <View style={{ backgroundColor: c.panel, borderRadius: radius.panel, padding: space.l, gap: space.l }}>
              {[0, 1, 2].map((r) => (
                <View key={r} style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
                  <Skel w={40} h={40} r={20} /><View style={{ flex: 1, gap: 6 }}><Skel w="55%" h={14} /><Skel w="30%" h={11} /></View><Skel w={60} h={14} />
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    )
  }
  return (
    <View style={{ gap: space.section - 4 }}>
      <View style={{ gap: space.s, paddingHorizontal: space.xs }}><Skel w={80} h={14} /><Skel w={220} h={44} r={10} /><Skel w={160} h={14} /></View>
      <View style={{ gap: space.s }}>
        <Skel w={120} h={22} style={{ marginLeft: space.xs }} />
        <View style={{ backgroundColor: c.panel, borderRadius: radius.panel, padding: space.l, gap: space.m }}>
          <Skel w={150} h={30} /><Skel w="70%" h={14} /><Skel w="100%" h={120} r={12} />
        </View>
      </View>
      <View style={{ backgroundColor: c.panel, borderRadius: radius.panel, height: 180 }} />
    </View>
  )
}
