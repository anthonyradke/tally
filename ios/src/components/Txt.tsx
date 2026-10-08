import { Children, type ReactNode } from 'react'
import { Text, type TextProps } from 'react-native'
import { mask, useHidden } from '@/lib/privacy'
import { tabular, font as ramp, useTheme } from '@/theme'

type Role = keyof typeof ramp
type Tone = 'label' | 'label2' | 'label3' | 'pos' | 'neg' | 'warn' | 'ink' | 'onInk'

/** Text with a role from the type ramp and a tone from the palette. `num` switches on tabular figures. With amounts
 *  hidden (lib/privacy), any "$12.34" in its text reads "$•••". */
export function Txt({ variant = 'body', tone = 'label', num, style, children, ...rest }: TextProps & { variant?: Role; tone?: Tone; num?: boolean }) {
  const { c } = useTheme()
  const hidden = useHidden()
  return (
    <Text maxFontSizeMultiplier={1.6} {...rest} style={[ramp[variant], { color: c[tone] }, num && tabular, style]}>
      {hidden ? masked(children) : children}
    </Text>
  )
}

function masked(children: ReactNode): ReactNode {
  if (typeof children === 'string') return mask(children)
  if (!Array.isArray(children)) return children
  return Children.map(children, (k) => (typeof k === 'string' ? mask(k) : k))
}
