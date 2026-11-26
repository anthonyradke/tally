// Amounts. `Money` is a figure in running text; `Rolling` is a large one that changes like SwiftUI's numeric text:
// only the digits that change move, the new one sliding in as the old one leaves, both fading. A figure too wide for
// its room steps its size down to fit, like a label set to adjust its font size.
import { useMemo, useRef, useState } from 'react'
import { Text, View, type TextStyle } from 'react-native'
import Animated, { LayoutAnimationConfig, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated'
import { scheduleOnUI } from 'react-native-worklets'
import { formatCents } from '@/lib/money'
import { DIGIT_OUT_MS, digitIn, digitOut, EASE, SETTLE } from '../motion'
import { type as styles, usePalette, type TypeName } from '../theme'
import { charKeys, fitSize } from './numeric'
import { Txt } from './Txt'

// Reanimated's layout transitions don't run on the web preview: a kept character stayed where it was.
const WEB = process.env.EXPO_OS === 'web'

export function Money({ cents, plus, tone = 'plain', v = 'body', weight, noCents }: {
  cents: number; plus?: boolean; tone?: 'pos' | 'plain' | 'quiet' | 'neg'; v?: TypeName; weight?: TextStyle['fontWeight']; noCents?: boolean
}) {
  const p = usePalette()
  const color = tone === 'pos' ? p.tint : tone === 'neg' ? p.red : tone === 'quiet' ? p.label2 : p.label
  const text = formatCents(plus ? Math.abs(cents) : cents, { cents: !noCents, sign: plus ? 'always' : 'auto' })
  return <Txt v={v} weight={weight} num color={color} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{text}</Txt>
}

/** The exit of a character that leaves, reading the direction when it leaves (1: the figure went down, so it drops;
 *  -1: it rises). A config fixed at render time used the previous change's direction, since the element that leaves
 *  isn't rendered in the render that removes it. */
const leave = (dir: SharedValue<number>, h: number) => () => {
  'worklet'
  const timing = { duration: DIGIT_OUT_MS, easing: EASE }
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: { opacity: withTiming(0, timing), transform: [{ translateY: withTiming(dir.value * h * 0.4, timing) }] },
  }
}

/** Characters keyed by their place (see `charKeys`), so only a character that changes swaps in. `typing`: places
 *  count from the left, for an amount being typed. `fit`: shrink the font when the text is wider than the room it's
 *  given (or `maxWidth`). `instant`: change without rolling (while a chart is scrubbed). */
export function NumericText({ text, style, down, typing, fit, maxWidth, instant, accessibilityLabel }: {
  text: string; style: TextStyle; down: boolean; typing?: boolean; fit?: boolean; maxWidth?: number; instant?: boolean; accessibilityLabel?: string
}) {
  const [room, setRoom] = useState<number | undefined>(undefined)
  const [natural, setNatural] = useState(0)
  const base = style.fontSize ?? 34
  const size = fit || maxWidth ? fitSize(base, natural, maxWidth ?? room) : base
  const k = size / base
  const h = Math.round((style.lineHeight ?? base * 1.2) * k)
  const shown: TextStyle = k === 1 ? style : { ...style, fontSize: size, lineHeight: h }
  const dir = useSharedValue(down ? 1 : -1)
  // Set on the UI thread ahead of this render's commit, so a character removed by it leaves the right way.
  if (!WEB) scheduleOnUI((d: number) => { 'worklet'; dir.value = d }, down ? 1 : -1)
  const exit = useMemo(() => (WEB ? undefined : leave(dir, h)), [dir, h])
  const keys = charKeys(text, typing)
  return (
    <View accessible accessibilityLabel={accessibilityLabel ?? text}
      onLayout={fit && maxWidth === undefined ? (e) => setRoom(e.nativeEvent.layout.width) : undefined}>
      <View style={{ flexDirection: 'row', height: h, alignSelf: 'flex-start' }}>
        {[...text].map((ch, i) => (
          <Animated.Text key={keys[i]} maxFontSizeMultiplier={1}
            entering={instant ? undefined : digitIn(down, h)} exiting={instant ? undefined : exit ?? digitOut(down, h)}
            layout={WEB || instant ? undefined : SETTLE} style={[shown, { height: h }]}>{ch}</Animated.Text>
        ))}
      </View>
      {(fit || maxWidth !== undefined) && (
        // The text at full size, unseen, to know how wide it wants to be.
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
          style={{ position: 'absolute', left: 0, top: 0, width: 4000, opacity: 0 }}>
          <Text maxFontSizeMultiplier={1} numberOfLines={1} style={[style, { alignSelf: 'flex-start' }]}
            onLayout={(e) => setNatural(e.nativeEvent.layout.width)}>{text}</Text>
        </View>
      )}
    </View>
  )
}

/** `instant`: change without rolling, for a figure that follows a finger along a chart. `fit` (on by default): the
 *  figure shrinks to the width it's given instead of running into what's beside it. */
export function Rolling({ cents, v = 'hero', color, noCents, instant, fit = true }: {
  cents: number; v?: TypeName; color?: string; noCents?: boolean; instant?: boolean; fit?: boolean
}) {
  const p = usePalette()
  const last = useRef(cents)
  const down = cents < last.current // eslint-disable-line react-hooks/refs
  last.current = cents // eslint-disable-line react-hooks/refs
  const style: TextStyle = { ...styles[v], color: color ?? p.label, fontVariant: ['tabular-nums'] }
  return (
    <LayoutAnimationConfig skipEntering>
      <NumericText text={formatCents(cents, { cents: !noCents })} style={style} down={down} fit={fit} instant={instant}
        accessibilityLabel={formatCents(cents)} />
    </LayoutAnimationConfig>
  )
}
