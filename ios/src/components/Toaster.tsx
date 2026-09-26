// The undo toast: a glass capsule floating above the tab bar. Glass is for floating chrome only; this is chrome.
// Swipe it down to put it away early. It lives in its own overlay window above the native screens and modals; as a
// plain sibling view it drew on top but its taps fell through to whatever row was underneath.
import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { FullWindowOverlay } from 'react-native-screens'
import Animated, { Easing, FadeOut, SlideInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import * as Haptics from 'expo-haptics'
import { useToast } from '@/lib/toast'
import { radius, space, useTheme } from '@/theme'
import { Txt } from './Txt'

const glass = isLiquidGlassAvailable()

function Overlay({ children }: { children: ReactNode }) {
  if (process.env.EXPO_OS === 'ios') return <FullWindowOverlay>{children}</FullWindowOverlay>
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">{children}</View>
}

export function Toaster() {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const { toast: current, hide } = useToast()
  const reduce = useReducedMotion()
  // The toast on screen. It outlives the store's by the length of its exit: a timed-out or answered toast sinks and
  // fades instead of vanishing (unmounting the overlay window cut its exit animation off).
  const [t, setT] = useState(current)
  if (current && current !== t) setT(current)
  if (!current && t && reduce) setT(null)
  const y = useSharedValue(0)
  const gone = useSharedValue(0)
  useEffect(() => {
    if (current) { gone.set(0); return }
    if (!reduce) gone.set(withTiming(1, { duration: 220, easing: Easing.bezier(0.4, 0, 1, 1) }, (ok) => { if (ok) scheduleOnRN(setT, null) }))
  }, [current]) // eslint-disable-line react-hooks/exhaustive-deps
  const drag = useAnimatedStyle(() => ({
    transform: [{ translateY: y.get() + gone.get() * 24 }, { scale: 1 - gone.get() * 0.04 }],
    opacity: (1 - Math.min(Math.max(y.get(), 0) / 120, 0.6)) * (1 - gone.get()),
  }))
  const pan = Gesture.Pan().activeOffsetY([-8, 8])
    .onUpdate((e) => { y.set(e.translationY > 0 ? e.translationY : e.translationY / 6) })
    .onEnd((e) => {
      if (e.translationY > 36 || e.velocityY > 500) y.set(withTiming(160, { duration: 180 }, () => scheduleOnRN(hide)))
      else y.set(withSpring(0, { damping: 20, stiffness: 300 }))
    })
  if (!t) return null
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingLeft: space.xl, paddingRight: t.action ? space.s : space.xl, paddingVertical: space.s, minHeight: 48 }}>
      <Txt variant="callout" tone={t.tone === 'error' ? 'neg' : 'label'} numberOfLines={2} style={{ flex: 1, fontWeight: '500' }}>{t.text}</Txt>
      {t.action && (
        <Pressable
          onPress={async () => { hide(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); await t.action!.run() }}
          hitSlop={8}
          style={({ pressed }) => ({ paddingHorizontal: space.l, height: 34, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: c.ink, opacity: pressed ? 0.7 : 1 })}>
          <Txt variant="sub" tone="onInk" style={{ fontWeight: '600', fontSize: 15 }}>{t.action.label}</Txt>
        </Pressable>
      )}
    </View>
  )
  return (
    <Overlay>
    <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents="box-none">
    <GestureDetector gesture={pan}>
    <Animated.View key={t.id} entering={SlideInDown.duration(260).easing(Easing.bezier(0.23, 1, 0.32, 1))} exiting={FadeOut.duration(160)}
      onLayout={() => y.set(0)} pointerEvents={current ? 'box-none' : 'none'} accessibilityLiveRegion="polite"
      style={{ position: 'absolute', left: space.l, right: space.l, bottom: insets.bottom + 62 }}>
    <Animated.View style={drag}>
      {glass ? (
        <GlassView glassEffectStyle="regular" isInteractive style={{ borderRadius: radius.pill }}>{body}</GlassView>
      ) : (
        <View style={{ borderRadius: radius.pill, backgroundColor: c.panelRaised, boxShadow: '0 6px 24px rgba(0,0,0,0.18)' }}>{body}</View>
      )}
    </Animated.View>
    </Animated.View>
    </GestureDetector>
    </GestureHandlerRootView>
    </Overlay>
  )
}
