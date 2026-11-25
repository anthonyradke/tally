import { addDays, dayLabel } from '@/lib/dates'
import { usePalette } from '../../theme'
import { Press } from '../Press'
import { Txt } from '../Txt'

/** Web preview stand-in for the compact date button: each tap goes a day back. */
export function DateChoice({ value, onChange, min }: { value: string; onChange: (iso: string) => void; min?: string; max?: string }) {
  const p = usePalette()
  return (
    <Press feel="none" haptic={false} onPress={() => { const d = addDays(value, -1); if (!min || d >= min) onChange(d) }}>
      <Txt v="body" color={p.tint} style={{ backgroundColor: p.fill3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, overflow: 'hidden' }}>{dayLabel(value)}</Txt>
    </Press>
  )
}
