import { Host, Picker, Text } from '@expo/ui/swift-ui'
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers'
import { tick } from '../../haptics'

/** The system segmented control. */
export function Segmented<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <Host matchContents={{ vertical: true }} style={{ alignSelf: 'stretch' }}>
      <Picker selection={value} modifiers={[pickerStyle('segmented')]} onSelectionChange={(v) => { tick(); onChange(v as T) }}>
        {options.map(([v, label]) => <Text key={v} modifiers={[tag(v)]}>{label}</Text>)}
      </Picker>
    </Host>
  )
}
