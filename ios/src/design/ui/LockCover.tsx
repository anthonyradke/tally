// What covers Tally in the app switcher: the system's material blur with the app's icon, the way Apple's own apps
// hide themselves. It floats over every screen and sheet, and is there at once, since iOS takes its snapshot as
// Tally leaves. Full strength, so no balance can be read through it.
import { StyleSheet, View } from 'react-native'
import { BlurView } from 'expo-blur'
import Animated, { FadeOut } from 'react-native-reanimated'
import { useCover } from '@/lib/lock'
import { AppMark } from './AppMark'
import { TopLayer, useLinger } from './Notice'

const OUT_MS = 220

export function LockCover() {
  const cover = useCover((s) => s.cover)
  // The layer stays a moment after the cover lifts, so the cover fades out instead of vanishing.
  const mounted = useLinger(cover, OUT_MS + 60)
  if (!mounted) return null
  return (
    <TopLayer>
      {cover && (
        <Animated.View exiting={FadeOut.duration(OUT_MS)} style={StyleSheet.absoluteFill}>
          <BlurView intensity={100} tint="systemMaterial" style={StyleSheet.absoluteFill} />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <AppMark size={76} />
          </View>
        </Animated.View>
      )}
    </TopLayer>
  )
}
