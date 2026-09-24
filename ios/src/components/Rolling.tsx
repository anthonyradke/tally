// Rolling digits: each digit is a column of 0-9 that slides to its value, so a changing figure reads as the same
// number moving rather than a swap. Used for hero figures and the keypad. Scrubbing bypasses this (the chart writes
// the figure on the UI thread), since a figure that rolls while the finger moves lags the finger.
// Figures here are proportional, like any large number set in SF Pro: each column is as wide as the digit it shows
// and eases to the next digit's width while it rolls. Tabular columns left a gap around every 1 ("$7 1 3").
import { memo, useEffect, useRef, useState } from 'react'
import { Text, View, type TextStyle } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { formatCents, type Sign } from '@/lib/money'

const EASE = Easing.bezier(0.23, 1, 0.32, 1)
const DIGITS = '0123456789'.split('')
let launched = false // hero figures roll up from zero once per launch, not on every revisit
const measured = new Map<string, number[]>() // the ten digit widths per text style, measured once per launch

const Digit = memo(function Digit({ d, h, style, fromZero, reduce }: { d: number; h: number; style: TextStyle; fromZero: boolean; reduce: boolean }) {
  const styleKey = `${style.fontSize}/${style.fontWeight}/${style.letterSpacing ?? 0}`
  const [widths, setWidths] = useState(() => measured.get(styleKey))
  const pending = useRef<number[]>([])
  const start = fromZero && !reduce ? 0 : d
  const y = useSharedValue(-start * h)
  const w = useSharedValue(widths ? widths[start] : 0)
  useEffect(() => {
    y.set(reduce ? -d * h : withTiming(-d * h, { duration: 520, easing: EASE }))
  }, [d, h, reduce, y])
  useEffect(() => {
    if (!widths) return
    w.set(reduce || w.get() === 0 ? widths[d] : withTiming(widths[d], { duration: 520, easing: EASE }))
  }, [d, widths, reduce, w])
  const column = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }))
  const size = useAnimatedStyle(() => (w.get() > 0 ? { width: w.get() } : {}))
  const onLayout = (n: number, width: number) => {
    pending.current[n] = width
    if (pending.current.filter((x) => x !== undefined).length < DIGITS.length) return
    measured.set(styleKey, pending.current)
    setWidths(pending.current)
  }
  return (
    <Animated.View style={[{ height: h, overflow: 'hidden', alignItems: 'center' }, size]}>
      <Animated.View style={[{ alignItems: 'center' }, widths && { width: Math.max(...widths) }, column]}>
        {DIGITS.map((n, i) => (
          <Text key={n} style={[style, { height: h, lineHeight: h }]}
            onLayout={widths ? undefined : (e) => onLayout(i, e.nativeEvent.layout.width)}>{n}</Text>
        ))}
      </Animated.View>
    </Animated.View>
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
