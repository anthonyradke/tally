// The New design's brief confirmations ("Added", "Deleted · Undo"): a glass capsule that drops in under the Dynamic
// Island on a spring and lifts away after a few seconds, or when tapped.
import { useEffect } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { FadeOutUp, SlideInUp } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import type { SFSymbol } from 'expo-symbols'
import { create } from 'zustand'
import { tap } from '../haptics'
import { space, usePalette, type Hue } from '../theme'
import { Symbol } from './Symbol'
import { Txt } from './Txt'

interface Note { id: number; text: string; symbol?: SFSymbol; hue?: Hue; action?: { label: string; run: () => unknown } }
const useNotice = create<{ note: Note | null }>(() => ({ note: null }))
let seq = 0

export function notify(n: Omit<Note, 'id'>) { useNotice.setState({ note: { ...n, id: ++seq } }) }
const clear = (id: number) => { if (useNotice.getState().note?.id === id) useNotice.setState({ note: null }) }

const glass = process.env.EXPO_OS === 'ios' && isLiquidGlassAvailable()

export function NoticeHost() {
  const note = useNotice((s) => s.note)
  const insets = useSafeAreaInsets()
  const p = usePalette()
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => clear(note.id), note.action ? 5000 : 2600)
    return () => clearTimeout(t)
  }, [note])
  if (!note) return null
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingLeft: space.l, paddingRight: note.action ? space.s : space.l, height: 48 }}>
      {note.symbol && <Symbol name={note.symbol} size={17} color={p[note.hue ?? 'green']} weight="semibold" />}
      <Txt v="subhead" weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>{note.text}</Txt>
      {note.action && (
        <Pressable hitSlop={8} onPress={() => { tap(); clear(note.id); Promise.resolve(note.action!.run()).catch(() => {}) }}
          style={{ paddingHorizontal: space.m, height: 34, borderRadius: 17, justifyContent: 'center', backgroundColor: p.fill3 }}>
          <Txt v="subhead" weight="600" tone="blue">{note.action.label}</Txt>
        </Pressable>
      )}
    </View>
  )
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 6, left: 0, right: 0, alignItems: 'center' }}>
      <Animated.View key={note.id} entering={SlideInUp.springify().damping(16).stiffness(190)} exiting={FadeOutUp.duration(200)}
        style={{ borderRadius: 24, overflow: 'hidden', maxWidth: '92%', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }}>
        <Pressable onPress={() => clear(note.id)}>
          {glass ? <GlassView style={{ borderRadius: 24 }}>{body}</GlassView>
            : <BlurView intensity={60} tint="systemChromeMaterial" style={{ backgroundColor: process.env.EXPO_OS === 'web' ? p.card : undefined }}>{body}</BlurView>}
        </Pressable>
      </Animated.View>
    </View>
  )
}
