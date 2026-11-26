// What covers Tally in the app switcher and while it waits for Face ID: the system's material blur with the app's
// icon, the way Apple's own apps hide themselves. It floats in its own layer over every screen, sheet and notice, and
// VoiceOver reads nothing under it (the layer is modal for accessibility). In the switcher it's there at once, since
// iOS takes its snapshot as Tally leaves. Locked, the system's Face ID sheet comes up over it; a cancel leaves one
// button to try again. Unlocking lifts it with a light tap.
import { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { unlock, useLock } from '@/lib/lock'
import { tap } from '../haptics'
import { space } from '../theme'
import { AppMark } from './AppMark'
import { Button } from './Button'
import { TopLayer, useLinger } from './Notice'

const OUT_MS = 250
// Critically damped: the cover settles away without overshooting, like the system's own Face ID unlock.
const OUT = FadeOut.springify().duration(OUT_MS).dampingRatio(1)

export function LockCover() {
  const cover = useLock((s) => s.cover)
  const locked = useLock((s) => s.locked)
  const retry = useLock((s) => s.locked && s.tried && !s.asking)
  const insets = useSafeAreaInsets()
  const shown = cover || locked
  // The layer stays a moment after the cover lifts, so the cover fades out instead of vanishing.
  const mounted = useLinger(shown, OUT_MS + 150)
  const was = useRef(locked)
  useEffect(() => {
    if (was.current && !locked) tap()
    was.current = locked
  }, [locked])
  if (!mounted) return null
  return (
    <TopLayer>
      {shown && (
        <Animated.View exiting={OUT} style={StyleSheet.absoluteFill}>
          <BlurView intensity={100} tint="systemMaterial" style={StyleSheet.absoluteFill} />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <AppMark size={76} />
          </View>
          {retry && (
            <Animated.View entering={FadeIn.duration(200)} style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + space.xxl, alignItems: 'center' }}>
              <Button label="Unlock with Face ID" symbol="faceid" kind="tinted" onPress={() => { unlock().catch(() => {}) }} style={{ minWidth: 220 }} />
            </Animated.View>
          )}
        </Animated.View>
      )}
    </TopLayer>
  )
}
