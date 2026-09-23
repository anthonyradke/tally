import { memo } from 'react'
import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import type { SFSymbol } from 'expo-symbols'
import type { MarkSpec } from '@/icons/merchants'
import { isTint, useTheme, type Theme, type Tint } from '@/theme'
import { Icon } from './Icon'
import { Txt } from './Txt'

/** Resolve a registry color token to a hex for the current theme. */
export function markColor(t: Theme, color: string): string {
  if (color === 'fg') return t.c.label
  if (color === 'pos') return t.c.pos
  if (color.startsWith('bank:')) return t.bank(color.slice(5))
  if (color.startsWith('tint:') && isTint(color.slice(5))) return t.tint(color.slice(5) as Tint)
  return color
}

type Props =
  | { kind: 'glyph'; sf: SFSymbol; md: string; tint: string; size?: number }
  | { kind: 'spec'; spec: MarkSpec; size?: number }

/** Leading circle for a row. Category glyphs sit white on a solid tint (Apple Card style); merchant brands sit in
 *  their own color on a quiet disc so a column of rows reads as logos, not a rainbow. */
export const Mark = memo(function Mark(p: Props) {
  const t = useTheme()
  const size = p.size ?? 40
  const disc = { width: size, height: size, borderRadius: size / 2, alignItems: 'center' as const, justifyContent: 'center' as const }
  if (p.kind === 'glyph') {
    return (
      <View style={[disc, { backgroundColor: p.tint }]}>
        <Icon sf={p.sf} md={p.md} size={size * 0.45} color="#FFFFFF" />
      </View>
    )
  }
  const color = markColor(t, p.spec.color)
  if (p.spec.kind === 'brand') {
    const g = size * 0.5
    return (
      <View style={[disc, { backgroundColor: t.c.fill }]} accessibilityLabel={p.spec.title}>
        <Svg width={g} height={g} viewBox="0 0 24 24"><Path d={p.spec.path} fill={color} /></Svg>
      </View>
    )
  }
  return (
    <View style={[disc, { backgroundColor: color }]} accessibilityLabel={p.spec.title}>
      <Txt style={{ fontSize: size * 0.42, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.5 }}>{p.spec.letter}</Txt>
    </View>
  )
})
