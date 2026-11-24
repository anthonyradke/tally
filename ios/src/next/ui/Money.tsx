// Amounts. `Money` is a figure in running text; `Rolling` is a big one whose digits roll into place when it
// changes, each on its own spring, like an odometer.
import { useEffect } from 'react'
import { Text, View, type TextStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated'
import { formatCents } from '@/lib/money'
import { springs, type as styles, usePalette, type TypeName } from '../theme'
import { Txt } from './Txt'

export function Money({ cents, plus, tone = 'plain', v = 'body', weight, noCents }: {
  cents: number; plus?: boolean; tone?: 'pos' | 'plain' | 'quiet' | 'neg'; v?: TypeName; weight?: TextStyle['fontWeight']; noCents?: boolean
}) {
  const p = usePalette()
  const color = tone === 'pos' ? p.green : tone === 'neg' ? p.red : tone === 'quiet' ? p.label2 : p.label
  const text = formatCents(plus ? Math.abs(cents) : cents, { cents: !noCents, sign: plus ? 'always' : 'auto' })
  return <Txt v={v} weight={weight} num color={color} numberOfLines={1}>{text}</Txt>
}

function Digit({ d, h, style, delay }: { d: number; h: number; style: TextStyle; delay: number }) {
  const y = useSharedValue(0)
  useEffect(() => { y.set(withDelay(delay, withSpring(-d * h, springs.smooth))) }, [d, h, delay, y])
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }))
  return (
    <View style={{ height: h, overflow: 'hidden' }}>
      <Animated.View style={anim}>
        {'0123456789'.split('').map((n) => <Text key={n} style={[style, { height: h }]}>{n}</Text>)}
      </Animated.View>
    </View>
  )
}

export function Rolling({ cents, v = 'hero', color, noCents }: { cents: number; v?: TypeName; color?: string; noCents?: boolean }) {
  const p = usePalette()
  const base = styles[v]
  const h = base.lineHeight ?? 56
  const style: TextStyle = { ...base, color: color ?? p.label, fontVariant: ['tabular-nums'] }
  const chars = formatCents(cents, { cents: !noCents }).split('')
  const n = chars.length
  return (
    <View style={{ flexDirection: 'row' }} accessible accessibilityLabel={formatCents(cents)}>
      {chars.map((ch, i) => {
        const fromEnd = n - i // keyed from the right: a new leading digit doesn't remount the others
        return /\d/.test(ch)
          ? <Digit key={`d${fromEnd}`} d={Number(ch)} h={h} style={style} delay={(n - fromEnd) * 18} />
          : <Text key={`s${fromEnd}${ch}`} style={[style, { height: h }]}>{ch}</Text>
      })}
    </View>
  )
}
