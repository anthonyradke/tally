import { DatePicker, Host } from '@expo/ui/swift-ui'
import { datePickerStyle, tint } from '@expo/ui/swift-ui/modifiers'
import { fromISO, toISO } from '@/lib/dates'
import { useTheme } from '@/theme'

/** The system calendar (SwiftUI graphical date picker). `min` greys out the days before it (Tally's start month:
 *  an entry dated earlier would count nowhere). */
export function DatePick({ value, onChange, min }: { value: string; onChange: (iso: string) => void; min?: string }) {
  const { c } = useTheme()
  return (
    <Host matchContents={{ vertical: true }} style={{ alignSelf: 'stretch' }}>
      <DatePicker selection={fromISO(value)} range={min ? { start: fromISO(min) } : undefined} displayedComponents={['date']} modifiers={[datePickerStyle('graphical'), tint(c.ink)]}
        onDateChange={(d) => onChange(toISO(d))} />
    </Host>
  )
}
