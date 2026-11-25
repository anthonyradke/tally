// What covers Tally in the app switcher: the system's material blur with the app's icon, the way Apple's own apps
// hide themselves. It floats over every screen and sheet, and is there at once, since iOS takes its snapshot as
// Tally leaves.
import { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { FullWindowOverlay } from 'react-native-screens'
import { BlurView } from 'expo-blur'
import Animated, { FadeOut } from 'react-native-reanimated'
import { useCover } from '@/lib/lock'
import { AppMark } from './AppMark'

function Overlay({ children }: { children: ReactNode }) {
  if (process.env.EXPO_OS === 'ios') return <FullWindowOverlay>{children}</FullWindowOverlay>
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">{children}</View>
}

export function LockCover() {
  const cover = useCover((s) => s.cover)
  if (!cover) return null
  return (
    <Overlay>
      <Animated.View exiting={FadeOut.duration(220)} style={StyleSheet.absoluteFill}>
        <BlurView intensity={60} tint="systemMaterial" style={StyleSheet.absoluteFill} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <AppMark size={76} />
        </View>
      </Animated.View>
    </Overlay>
  )
}
