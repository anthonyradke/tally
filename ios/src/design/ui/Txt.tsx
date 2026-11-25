import { Text, type TextProps, type TextStyle } from 'react-native'
import { type as styles, usePalette, type TypeName } from '../theme'

type Tone = 'label' | 'label2' | 'label3' | 'tint' | 'blue' | 'green' | 'red' | 'orange' | 'onTint'

/** Text in one of Apple's text styles. `num` lines figures up (amounts in columns don't shimmer as they change). */
export function Txt({ v = 'body', tone = 'label', weight, num, center, color, style, ...rest }: TextProps & {
  v?: TypeName; tone?: Tone; weight?: TextStyle['fontWeight']; num?: boolean; center?: boolean; color?: string
}) {
  const p = usePalette()
  return (
    <Text {...rest} style={[styles[v], { color: color ?? p[tone] }, weight ? { fontWeight: weight } : null,
      num ? { fontVariant: ['tabular-nums'] } : null, center ? { textAlign: 'center' } : null, style]} />
  )
}
