import type { ReactNode } from 'react'
import { Pressable } from 'react-native'
import * as Haptics from 'expo-haptics'
import { radius, space, useTheme } from '@/theme'
import { Txt } from './Txt'

/** A pill. Selected chips are ink (the one accent); the rest sit on the panel color. */
export function Chip({ label, selected, onPress, leading, onDark }: { label: string; selected?: boolean; onPress?: () => void; leading?: ReactNode; onDark?: boolean }) {
  const { c } = useTheme()
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress?.() }}
      accessibilityRole="button" accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: space.s, height: 36, paddingLeft: leading ? space.xs : space.l, paddingRight: space.l,
        borderRadius: radius.pill, backgroundColor: selected ? c.ink : onDark ? c.fill : c.panel,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}>
      {leading}
      <Txt variant="sub" tone={selected ? 'onInk' : 'label'} style={{ fontSize: 15, fontWeight: '600' }}>{label}</Txt>
    </Pressable>
  )
}
