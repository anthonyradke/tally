import { Host, Picker, Text } from '@expo/ui/swift-ui'
import { labelsHidden, pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers'
import { tick } from '../../haptics'
import { usePalette } from '../../theme'

/** The system pop-up menu picker: the chosen value with up-down chevrons, a menu of the rest when tapped. Sits on
 *  the right of a list row. `none`: the label for no choice yet. */
export function Choice<T extends string | number>({ options, value, onChange, none }: {
  options: [T, string][]; value: T | null; onChange: (v: T) => void; none?: string
}) {
  const p = usePalette()
  const NONE = '__none__'
  return (
    <Host matchContents>
      <Picker selection={value ?? NONE} modifiers={[pickerStyle('menu'), labelsHidden(), tint(value == null ? p.blue : p.label2)]}
        onSelectionChange={(v) => { if (v !== NONE) { tick(); onChange(v as T) } }}>
        {[...(value == null ? [<Text key={NONE} modifiers={[tag(NONE)]}>{none ?? 'Choose'}</Text>] : []),
          ...options.map(([v, label]) => <Text key={String(v)} modifiers={[tag(v)]}>{label}</Text>)]}
      </Picker>
    </Host>
  )
}
