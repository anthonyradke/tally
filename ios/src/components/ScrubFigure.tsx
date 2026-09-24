import type { ReactNode } from 'react'
import { StyleSheet, TextInput, View, type TextStyle } from 'react-native'
import Animated, { useAnimatedProps, useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { formatCentsW, type Sign } from '@/lib/money'
import { tabular, useTheme } from '@/theme'
import { RollingMoney } from './Rolling'

const AText = Animated.createAnimatedComponent(TextInput)

/** A figure that rolls to `cents` at rest and follows the finger while its chart is scrubbed: the value and the
 *  caption under it are written on the UI thread from `values[i]` / `labels[i]`. */
export function ScrubFigure({ cents, values, labels, scrub, style, sign = 'auto', caption, rollIn, whole }: {
  cents: number
  values: number[]
  labels: string[]
  scrub: SharedValue<number>
  style: TextStyle
  sign?: Sign
  caption?: ReactNode
  rollIn?: boolean
  whole?: boolean
}) {
  const { c } = useTheme()
  const rest = useAnimatedStyle(() => ({ opacity: scrub.get() < 0 ? 1 : 0 }))
  const live = useAnimatedStyle(() => ({ opacity: scrub.get() < 0 ? 0 : 1 }))
  const figure = useAnimatedProps(() => {
    const i = scrub.get()
    const v = i >= 0 && i < values.length ? values[i] : cents
    const text = formatCentsW(v, !whole, sign)
    return { text, defaultValue: text } as never
  })
  const cap = useAnimatedProps(() => {
    const i = scrub.get()
    const text = i >= 0 && i < labels.length ? labels[i] : ''
    return { text, defaultValue: text } as never
  })
  const h = Math.round((style.fontSize ?? 17) * 1.2)
  return (
    <View>
      <View>
        <Animated.View style={rest}><RollingMoney cents={cents} sign={sign} whole={whole} style={style} rollIn={rollIn} /></Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, live]} pointerEvents="none">
          <AText editable={false} underlineColorAndroid="transparent" animatedProps={figure}
            style={[style, tabular, { padding: 0, margin: 0, height: h, lineHeight: h, color: style.color }]} />
        </Animated.View>
      </View>
      {caption !== undefined && (
        <View style={{ minHeight: 20, justifyContent: 'center' }}>
          <Animated.View style={rest}>{caption}</Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { justifyContent: 'center' }, live]} pointerEvents="none">
            <AText editable={false} animatedProps={cap}
              style={{ padding: 0, margin: 0, fontSize: 15, fontWeight: '500', letterSpacing: -0.2, color: c.label2 }} />
          </Animated.View>
        </View>
      )}
    </View>
  )
}
