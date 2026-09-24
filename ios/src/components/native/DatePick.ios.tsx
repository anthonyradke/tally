import { DatePicker, Host } from '@expo/ui/swift-ui'
import { datePickerStyle, tint } from '@expo/ui/swift-ui/modifiers'
import { fromISO, toISO } from '@/lib/dates'
import { useTheme } from '@/theme'

/** The system calendar (SwiftUI graphical date picker). */
export function DatePick({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const { c } = useTheme()
  return (
    <Host matchContents={{ vertical: true }} style={{ alignSelf: 'stretch' }}>
      <DatePicker selection={fromISO(value)} displayedComponents={['date']} modifiers={[datePickerStyle('graphical'), tint(c.ink)]}
        onDateChange={(d) => onChange(toISO(d))} />
    </Host>
  )
}
