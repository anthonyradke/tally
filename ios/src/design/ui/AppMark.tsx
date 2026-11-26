// Tally's icon drawn in the app (the welcome screen, the lock cover): whichever one is on the home screen now
// (Settings, App Icon), in the icon's own continuous-corner square.
import { View } from 'react-native'
import { Image } from 'expo-image'
import { iconSource, useAppIcon } from '@/lib/appIcon'

export function AppMark({ size = 76 }: { size?: number }) {
  const name = useAppIcon((s) => s.name)
  return (
    // A background in the icon's shape lets iOS draw the shadow from its outline instead of rendering offscreen.
    <View style={{ borderRadius: size * 0.225, borderCurve: 'continuous', backgroundColor: '#000000',
      shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: size * 0.12, shadowOffset: { width: 0, height: size * 0.05 } }}>
      <View style={{ width: size, height: size, borderRadius: size * 0.225, borderCurve: 'continuous', overflow: 'hidden' }}>
        <Image source={iconSource(name)} style={{ width: size, height: size }} accessibilityLabel="Tally" />
      </View>
    </View>
  )
}
