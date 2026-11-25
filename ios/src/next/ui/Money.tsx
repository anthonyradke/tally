// Amounts. `Money` is a figure in running text; `Rolling` is a large one that changes like SwiftUI's numeric text:
// only the digits that change move, the new one sliding in as the old one leaves, both fading.
import { useRef } from 'react'
import { View, type TextStyle } from 'react-native'
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated'
import { formatCents } from '@/lib/money'
import { digitIn, digitOut, SETTLE } from '../motion'
import { type as styles, usePalette, type TypeName } from '../theme'
import { Txt } from './Txt'

export function Money({ cents, plus, tone = 'plain', v = 'body', weight, noCents }: {
  cents: number; plus?: boolean; tone?: 'pos' | 'plain' | 'quiet' | 'neg'; v?: TypeName; weight?: TextStyle['fontWeight']; noCents?: boolean
}) {
  const p = usePalette()
  const color = tone === 'pos' ? p.green : tone === 'neg' ? p.red : tone === 'quiet' ? p.label2 : p.label
  const text = formatCents(plus ? Math.abs(cents) : cents, { cents: !noCents, sign: plus ? 'always' : 'auto' })
  return <Txt v={v} weight={weight} num color={color} numberOfLines={1}>{text}</Txt>
}

/** Characters keyed by their place, so only a character that changes swaps in. Places count from the right for a
 *  figure that changes (a new leading digit doesn't disturb the rest), from the left for one being typed (each new
 *  digit appears at the end). */
export function NumericText({ text, style, down, typing }: { text: string; style: TextStyle; down: boolean; typing?: boolean }) {
  const h = style.lineHeight ?? 40
  const chars = text.split('')
  return (
    <View style={{ flexDirection: 'row' }}>
      {chars.map((ch, i) => {
        const place = typing ? i : chars.length - i
        return (
          <Animated.Text key={`${place}:${ch}`} entering={digitIn(down, h)} exiting={digitOut(down, h)} layout={SETTLE}
            style={[style, { height: h }]}>{ch}</Animated.Text>
        )
      })}
    </View>
  )
}

export function Rolling({ cents, v = 'hero', color, noCents }: { cents: number; v?: TypeName; color?: string; noCents?: boolean }) {
  const p = usePalette()
  const last = useRef(cents)
  const down = cents < last.current // eslint-disable-line react-hooks/refs
  last.current = cents // eslint-disable-line react-hooks/refs
  const style: TextStyle = { ...styles[v], color: color ?? p.label, fontVariant: ['tabular-nums'] }
  return (
    <View accessible accessibilityLabel={formatCents(cents)}>
      <LayoutAnimationConfig skipEntering>
        <NumericText text={formatCents(cents, { cents: !noCents })} style={style} down={down} />
      </LayoutAnimationConfig>
    </View>
  )
}
