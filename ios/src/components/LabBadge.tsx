import { View } from 'react-native'
import { router } from 'expo-router'
import { useServer } from '@/lib/server'
import { radius, space, useTheme } from '@/theme'
import { Tap } from './Tap'
import { Txt } from './Txt'

/** "Lab" at the top left of every tab while the app is on Tally Lab, so its copy of the ledger is never taken for the
 *  real one. Tapping it opens Settings, Server, where the switch back is. Nothing shows on the real Tally. */
export function LabBadge() {
  const { c } = useTheme()
  const lab = useServer((s) => s.profile === 'lab')
  if (!lab) return null
  return (
    <Tap feedback="scale" hitSlop={8} onPress={() => router.push('/settings/server')} accessibilityLabel="Tally Lab. Switch in Settings, Server.">
      <View style={{ backgroundColor: c.warn, borderRadius: radius.pill, paddingHorizontal: space.m, paddingVertical: 3 }}>
        <Txt variant="sub" style={{ color: '#FFFFFF', fontWeight: '700' }}>Lab</Txt>
      </View>
    </Tap>
  )
}
