import type { TextProps } from 'react-native'
import { formatCents, type Sign } from '@/lib/money'
import type { Tone } from '@/lib/txn'
import { font as ramp } from '@/theme'
import { Txt } from './Txt'

/** A static money figure. Positive tone is green; neutral follows the label (muted = secondary). */
export function Money({ cents, sign = 'auto', tone = 'neutral', muted, whole, variant = 'row', ...rest }:
  TextProps & { cents: number; sign?: Sign; tone?: Tone; muted?: boolean; whole?: boolean; variant?: keyof typeof ramp }) {
  const t = tone === 'pos' ? 'pos' : tone === 'neg' ? 'neg' : muted ? 'label2' : 'label'
  return <Txt variant={variant} tone={t} num selectable {...rest}>{formatCents(cents, { sign, cents: !whole })}</Txt>
}
