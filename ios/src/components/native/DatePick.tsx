import { TextInput } from 'react-native'
import { radius, useTheme } from '@/theme'

/** Web preview fallback: a plain YYYY-MM-DD field. iOS uses the system calendar (DatePick.ios.tsx). */
export function DatePick({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const { c } = useTheme()
  return (
    <TextInput value={value} onChangeText={(v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && onChange(v)} placeholder="YYYY-MM-DD"
      style={{ height: 44, borderRadius: radius.input, backgroundColor: c.panel, paddingHorizontal: 12, fontSize: 17, color: c.label }} />
  )
}
