// What covers Tally in the app switcher, and while it's locked with Face ID (Settings): the system's material blur
// with the app's icon, the way Apple's own apps hide themselves. Locked, it adds Unlock. It floats over every screen
// and sheet, and a link that came in while locked opens once it's gone.
import { useEffect, type ReactNode } from 'react'
import { AppState, StyleSheet, View } from 'react-native'
import { router, useRootNavigationState } from 'expo-router'
import { FullWindowOverlay } from 'react-native-screens'
import { BlurView } from 'expo-blur'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { unlock, useLock } from '@/lib/lock'
import { space } from '../theme'
import { AppMark } from './AppMark'
import { Button } from './Button'
import { Txt } from './Txt'

function Overlay({ children }: { children: ReactNode }) {
  if (process.env.EXPO_OS === 'ios') return <FullWindowOverlay>{children}</FullWindowOverlay>
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">{children}</View>
}

export function LockCover() {
  const { locked, cover, held, ready } = useLock()
  useEffect(() => {
    if (locked && AppState.currentState === 'active') unlock()
  }, [locked])
  const navReady = !!useRootNavigationState()?.key
  useEffect(() => {
    if (!ready || locked || !held || !navReady) return
    useLock.setState({ held: null })
    router.push(held as never)
  }, [ready, locked, held, navReady])
  if (!locked && !cover) return null
  return (
    <Overlay>
      {/* The switcher cover is there at once: iOS takes its snapshot as Tally leaves, and a fade could miss it. */}
      <Animated.View entering={locked ? FadeIn.duration(150) : undefined} exiting={FadeOut.duration(220)} style={StyleSheet.absoluteFill}>
        <BlurView intensity={locked ? 90 : 60} tint="systemMaterial" style={StyleSheet.absoluteFill} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xl }}>
          <AppMark size={76} />
          {locked && (
            <>
              <Txt v="title3">Tally Is Locked</Txt>
              <Button label="Unlock" symbol="faceid" kind="tinted" onPress={() => unlock()} style={{ minWidth: 180 }} />
            </>
          )}
        </View>
      </Animated.View>
    </Overlay>
  )
}
