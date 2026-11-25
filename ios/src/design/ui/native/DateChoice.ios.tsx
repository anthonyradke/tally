import { DatePicker, Host } from '@expo/ui/swift-ui'
import { datePickerStyle, labelsHidden } from '@expo/ui/swift-ui/modifiers'
import { fromISO, toISO } from '@/lib/dates'

/** The system compact date button; tapping it opens the calendar. */
export function DateChoice({ value, onChange, min, max }: { value: string; onChange: (iso: string) => void; min?: string; max?: string }) {
  return (
    <Host matchContents>
      <DatePicker selection={fromISO(value)} displayedComponents={['date']}
        range={min || max ? { start: min ? fromISO(min) : undefined, end: max ? fromISO(max) : undefined } : undefined}
        modifiers={[datePickerStyle('compact'), labelsHidden()]} onDateChange={(d) => onChange(toISO(d))} />
    </Host>
  )
}
