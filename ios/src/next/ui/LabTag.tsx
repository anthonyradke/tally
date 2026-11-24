import { View } from 'react-native'
import { router } from 'expo-router'
import { useServer } from '@/lib/server'
import { usePalette } from '../theme'
import { Press } from './Press'
import { Txt } from './Txt'

/** Shown at the top left while the app is on Tally Lab, so it's never mistaken for the real ledger. */
export function LabTag() {
  const p = usePalette()
  const lab = useServer((s) => s.profile === 'lab')
  if (!lab) return null
  return (
    <Press onPress={() => router.push('/next/settings/server')} accessibilityLabel="On Tally Lab. Change server.">
      <View style={{ backgroundColor: p.orange, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
        <Txt v="footnote" weight="700" color="#FFFFFF">LAB</Txt>
      </View>
    </Press>
  )
}
