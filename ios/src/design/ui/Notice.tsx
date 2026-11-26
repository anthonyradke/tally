// The New design's brief confirmations ("Added", "Deleted · Undo"): a glass capsule that drops in under the Dynamic
// Island and lifts away after a few seconds, or when tapped. It floats in its own window above every sheet (add,
// check-in, settings, welcome), the way LockCover does, so Undo and errors are never hidden under one.
import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { FadeOut, Keyframe } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FullWindowOverlay } from 'react-native-screens'
import { BlurView } from 'expo-blur'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { tap } from '../haptics'
import { EASE } from '../motion'
import { clearNotice as clear, runAction, useNotice } from '../notify'
import { space, usePalette } from '../theme'
import { SF } from './SF'
import { Txt } from './Txt'

export { notify, reasonOf } from '../notify'

const glass = process.env.EXPO_OS === 'ios' && isLiquidGlassAvailable()
// In from just above with a slight scale, like the system's own banners; out as a quick fade.
const ENTER = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -14 }, { scale: 0.96 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: EASE },
}).duration(380)
const EXIT_MS = 200
const EXIT = FadeOut.duration(EXIT_MS)

/** Above every native sheet on iOS; a plain layer elsewhere. */
export function TopLayer({ children }: { children: ReactNode }) {
  if (process.env.EXPO_OS === 'ios') return <FullWindowOverlay>{children}</FullWindowOverlay>
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">{children}</View>
}

/** Keeps a layer mounted a little after `on` goes false, so what's in it can play its exit. */
export function useLinger(on: boolean, ms: number): boolean {
  const [kept, setKept] = useState(on)
  useEffect(() => {
    if (on) { const t = setTimeout(() => setKept(true), 0); return () => clearTimeout(t) }
    const t = setTimeout(() => setKept(false), ms)
    return () => clearTimeout(t)
  }, [on, ms])
  return on || kept
}

export function NoticeHost() {
  const note = useNotice((s) => s.note)
  const insets = useSafeAreaInsets()
  const p = usePalette()
  const mounted = useLinger(!!note, EXIT_MS + 60)
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => clear(note.id), note.action ? 5000 : 2600)
    return () => clearTimeout(t)
  }, [note])
  if (!mounted) return null
  const body = note && (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingLeft: space.l, paddingRight: note.action ? space.s : space.l, height: 48 }}>
      {note.symbol && <SF name={note.symbol} size={17} color={p[note.hue ?? 'green']} weight="semibold" />}
      <Txt v="subhead" weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>{note.text}</Txt>
      {note.action && (
        <Pressable hitSlop={8} accessibilityRole="button" onPress={() => { tap(); clear(note.id); runAction(note) }}
          style={{ paddingHorizontal: space.m, height: 34, borderRadius: 17, justifyContent: 'center', backgroundColor: p.fill3 }}>
          <Txt v="subhead" weight="600" tone="tint">{note.action.label}</Txt>
        </Pressable>
      )}
    </View>
  )
  return (
    <TopLayer>
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 6, left: 0, right: 0, alignItems: 'center' }}>
        {note && (
          // The shadow on the outer view and the clipping on the inner one: iOS drops a shadow on a view that clips.
          <Animated.View key={note.id} entering={ENTER} exiting={EXIT} accessibilityLiveRegion="polite"
            style={{ maxWidth: '92%', borderRadius: 24, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }}>
            <View style={{ borderRadius: 24, overflow: 'hidden' }}>
              <Pressable onPress={() => clear(note.id)}>
                {glass ? <GlassView style={{ borderRadius: 24 }}>{body}</GlassView>
                  : <BlurView intensity={60} tint="systemChromeMaterial" style={{ backgroundColor: process.env.EXPO_OS === 'web' ? p.card : undefined }}>{body}</BlurView>}
              </Pressable>
            </View>
          </Animated.View>
        )}
      </View>
    </TopLayer>
  )
}
