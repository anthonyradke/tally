// What covers Tally while it's locked (Face ID, if switched on in Settings) or sitting in the app switcher: a blur
// with the t, and when locked, an Unlock button. It floats over every screen and sheet.
import { useEffect, type ReactNode } from 'react'
import { AppState, StyleSheet, View } from 'react-native'
import { FullWindowOverlay } from 'react-native-screens'
import { BlurView } from 'expo-blur'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { unlock, useLock } from '@/lib/lock'
import { space, useTheme } from '@/theme'
import { Icon } from './Icon'
import { Button } from './Tap'
import { Txt } from './Txt'

function Overlay({ children }: { children: ReactNode }) {
  if (process.env.EXPO_OS === 'ios') return <FullWindowOverlay>{children}</FullWindowOverlay>
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">{children}</View>
}

export function LockScreen() {
  const { c, dark } = useTheme()
  const { locked, cover } = useLock()
  // Ask as soon as it locks while Tally is in front (on launch, or coming back after a while).
  useEffect(() => {
    if (locked && AppState.currentState === 'active') unlock()
  }, [locked])
  if (!locked && !cover) return null
  return (
    <Overlay>
      <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(220)} style={StyleSheet.absoluteFill}>
        <BlurView intensity={locked ? 100 : 40} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        {locked && <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, opacity: 0.6 }]} />}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.l }}>
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Icon sf="lock.fill" md="lock" size={30} color={c.onInk} />
          </View>
          {locked && (
            <>
              <Txt variant="title2">Tally is locked</Txt>
              <Button label="Unlock" onPress={() => unlock()} style={{ minWidth: 160 }} />
            </>
          )}
        </View>
      </Animated.View>
    </Overlay>
  )
}
