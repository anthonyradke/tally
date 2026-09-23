// Rolling digits: each digit is a column of 0-9 that slides to its value, so a changing figure reads as the same
// number moving rather than a swap. Used for hero figures and the keypad. Scrubbing bypasses this (the chart writes
// the figure on the UI thread), since a figure that rolls while the finger moves lags the finger.
import { memo, useEffect, useState } from 'react'
import { Text, View, type TextStyle } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { formatCents, type Sign } from '@/lib/money'
import { tabular } from '@/theme'

const EASE = Easing.bezier(0.23, 1, 0.32, 1)
const DIGITS = '0123456789'.split('')
let launched = false // hero figures roll up from zero once per launch, not on every revisit

const Digit = memo(function Digit({ d, h, style, fromZero, reduce }: { d: number; h: number; style: TextStyle; fromZero: boolean; reduce: boolean }) {
  const y = useSharedValue(fromZero && !reduce ? 0 : -d * h)
  useEffect(() => {
    y.set(reduce ? -d * h : withTiming(-d * h, { duration: 520, easing: EASE }))
  }, [d, h, reduce, y])
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }))
  return (
    <View style={{ height: h, overflow: 'hidden' }}>
      <Animated.View style={a}>
        {DIGITS.map((n) => <Text key={n} style={[style, tabular, { height: h, lineHeight: h }]}>{n}</Text>)}
      </Animated.View>
    </View>
  )
})

export function RollingText({ text, style, rollIn }: { text: string; style: TextStyle; rollIn?: boolean }) {
  const reduce = !!useReducedMotion()
  const [fromZero] = useState(() => !!rollIn && !launched)
  useEffect(() => { if (rollIn) launched = true }, [rollIn])
  const h = Math.round((style.fontSize ?? 17) * 1.2)
  const chars = text.split('')
  // Key columns from the right so "$999" → "$1,000" keeps the ones column where it was.
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }} accessible accessibilityRole="text" accessibilityLabel={text}>
      {chars.map((ch, i) => {
        const key = chars.length - i
        if (ch >= '0' && ch <= '9') {
          return <Digit key={`d${key}`} d={Number(ch)} h={h} style={style} fromZero={fromZero} reduce={reduce} />
        }
        return <Text key={`s${key}`} style={[style, { height: h, lineHeight: h }]}>{ch}</Text>
      })}
    </View>
  )
}

export function RollingMoney({ cents, sign = 'auto', whole, style, rollIn }: { cents: number; sign?: Sign; whole?: boolean; style: TextStyle; rollIn?: boolean }) {
  return <RollingText text={formatCents(cents, { sign, cents: !whole })} style={style} rollIn={rollIn} />
}
