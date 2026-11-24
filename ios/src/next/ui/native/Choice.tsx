import { View } from 'react-native'
import { tick } from '../../haptics'
import { usePalette } from '../../theme'
import { Press } from '../Press'
import { Symbol } from '../Symbol'
import { Txt } from '../Txt'

/** Web preview stand-in for the system menu picker: each tap moves to the next option. */
export function Choice<T extends string | number>({ options, value, onChange, none }: {
  options: [T, string][]; value: T | null; onChange: (v: T) => void; none?: string
}) {
  const p = usePalette()
  const i = options.findIndex(([v]) => v === value)
  const label = i >= 0 ? options[i][1] : (none ?? 'Choose')
  return (
    <Press feel="none" haptic={false} onPress={() => { if (options.length) { tick(); onChange(options[(i + 1) % options.length][0]) } }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Txt v="body" color={i >= 0 ? p.label2 : p.blue} numberOfLines={1}>{label}</Txt>
        <Symbol name="chevron.up.chevron.down" size={12} color={i >= 0 ? p.label2 : p.blue} weight="semibold" />
      </View>
    </Press>
  )
}
