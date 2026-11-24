import { View } from 'react-native'
import { tick } from '../../haptics'
import { usePalette } from '../../theme'
import { Press } from '../Press'
import { Txt } from '../Txt'

/** Web preview stand-in for the system segmented control. */
export function Segmented<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  const p = usePalette()
  return (
    <View style={{ flexDirection: 'row', backgroundColor: p.fill3, borderRadius: 999, padding: 2 }}>
      {options.map(([v, label]) => (
        <Press key={v} feel="none" haptic={false} onPress={() => { tick(); onChange(v) }} style={{ flex: 1 }}>
          <View style={{ height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: v === value ? p.card : 'transparent' }}>
            <Txt v="subhead" weight={v === value ? '600' : '400'}>{label}</Txt>
          </View>
        </Press>
      ))}
    </View>
  )
}
