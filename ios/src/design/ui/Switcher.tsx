// The category switcher from Mail: a row of round buttons where the chosen one widens into a colored capsule with its
// name, and the others narrow to their symbol. The capsules glide to their new widths together and settle without
// overshooting; the name fades in once there's room for it. As in Mail, a swipe across the bar jumps to the far end
// (left goes to the last one, right to the first), and a tap picks any of them.
//
// The move runs on the UI thread from the moment the tap or swipe ends: the gesture's worklet starts it, and nothing
// in it waits on React. The screen hears about the choice afterwards (`onChange`), so however long the screen takes
// to catch up, the capsule never stalls. See `switching.ts` for the arithmetic.
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { Text, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets'
import type { SFSymbol } from 'expo-symbols'
import { tick } from '../haptics'
import { EASE } from '../motion'
import { deepen } from '../color'
import { usePalette, type Hue } from '../theme'
import { SF } from './SF'
import { labelOpacity, lights, lit } from './switching'

export interface SwitchOption<K extends string> { key: K; label: string; symbol: SFSymbol; hue: Hue }

const H = 44
const NARROW = 56
const LABEL_GAP = 7
/** The capsule's move: a segmented control's pace on Tally's ease-out curve, so most of it is done in the first
 *  100 ms and it lands softly, never past its mark. */
export const SWITCH_MS = 240
const LABEL = { color: '#FFFFFF', fontSize: 17, fontWeight: '600' } as const

interface Lights { from: SharedValue<number[]>; target: SharedValue<number>; t: SharedValue<number> }

const Pill = memo(function Pill({ o, j, on, width, l, go, chosen }: {
  o: SwitchOption<string>; j: number; on: boolean; width: number | undefined; l: Lights
  go: (j: number) => boolean; chosen: (j: number) => void
}) {
  const p = usePalette()
  // The capsule's color, deepened where the bright system hue would leave its white label under 3:1 (green, the
  // dark-mode tint, yellow), the way Mail's capsules stay legible.
  const fill = deepen(o.hue === 'tint' ? p.tintFill : p[o.hue])
  const off = p.fill3
  const { from, target, t } = l
  // Every light adds up to 1, so the chosen capsule's grow and the others' shrink always fill the bar exactly.
  const capsule = useAnimatedStyle(() => {
    const k = lit(from.value, target.value, t.value, j)
    return { flexGrow: k, backgroundColor: interpolateColor(k, [0, 1], [off, fill]) }
  })
  const white = useAnimatedStyle(() => ({ opacity: lit(from.value, target.value, t.value, j) }))
  const gray = useAnimatedStyle(() => ({ opacity: 1 - lit(from.value, target.value, t.value, j) }))
  // The name opens to its own width as the capsule does, so the symbol and name stay centered together, and the
  // symbol alone sits centered in a round button.
  const label = useAnimatedStyle(() => {
    const k = lit(from.value, target.value, t.value, j)
    return { width: (width ?? 0) * k, marginLeft: LABEL_GAP * k, opacity: labelOpacity(k) }
  })
  const tap = useMemo(() => Gesture.Tap().maxDistance(10).hitSlop(4).onEnd((_e, ok) => {
    if (ok && go(j)) scheduleOnRN(chosen, j)
  }), [go, chosen, j])
  return (
    <GestureDetector gesture={tap}>
      <Animated.View accessible accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label}
        onAccessibilityTap={() => { if (!on) { scheduleOnUI(go, j); chosen(j) } }}
        style={[{ height: H, borderRadius: H / 2, flexBasis: NARROW, flexShrink: 0, overflow: 'hidden',
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, capsule]}>
        <View style={{ width: 19, height: 19 }}>
          <Animated.View style={[{ position: 'absolute' }, gray]}><SF name={o.symbol} size={19} color={p.label2} weight="semibold" /></Animated.View>
          <Animated.View style={[{ position: 'absolute' }, white]}><SF name={o.symbol} size={19} color="#FFFFFF" weight="semibold" /></Animated.View>
        </View>
        {width === undefined
          // Until the names are measured (the first layout), the chosen one shows at its natural width.
          ? on ? <Text numberOfLines={1} style={[LABEL, { marginLeft: LABEL_GAP }]}>{o.label}</Text> : null
          : (
            <Animated.View style={[{ overflow: 'hidden' }, label]}>
              <Text numberOfLines={1} style={[LABEL, { width }]}>{o.label}</Text>
            </Animated.View>
          )}
      </Animated.View>
    </GestureDetector>
  )
})

/** `initial`: the option chosen at first; the bar keeps its own choice after that and reports each new one through
 *  `onChange` (with a selection tick). */
export function Switcher<K extends string>({ options, initial, onChange }: { options: SwitchOption<K>[]; initial: K; onChange: (k: K) => void }) {
  const start = Math.max(0, options.findIndex((o) => o.key === initial))
  const [shown, setShown] = useState(start)
  const from = useSharedValue<number[]>(options.map((_, j) => (j === start ? 1 : 0)))
  const target = useSharedValue(start)
  const t = useSharedValue(1)
  const l = useMemo(() => ({ from, target, t }), [from, target, t])

  // Starts a move on the UI thread: every light eases from where it stands now (mid-move too) to the new choice.
  // False when `j` is already the choice.
  const go = useCallback((j: number): boolean => {
    'worklet'
    if (j === target.get()) return false
    from.set(lights(from.get(), target.get(), t.get()))
    target.set(j)
    t.set(0)
    t.set(withTiming(1, { duration: SWITCH_MS, easing: EASE }))
    return true
  }, [from, target, t])

  // The JS side of a choice, after the capsule is already moving.
  const chosen = useCallback((j: number) => {
    tick()
    setShown(j)
    onChange(options[j].key)
  }, [options, onChange])

  const swipe = useMemo(() => {
    const end = options.length - 1
    return Gesture.Pan()
      .activeOffsetX([-14, 14])
      .failOffsetY([-12, 12])
      .onEnd((e) => {
        if (Math.abs(e.translationX) < 30 && Math.abs(e.velocityX) < 300) return
        const j = e.translationX < 0 ? end : 0
        if (go(j)) scheduleOnRN(chosen, j)
      })
  }, [options.length, go, chosen])

  // Each name's natural width, measured once off screen, so a capsule can open its name to exactly that width.
  const measured = useRef<number[]>([])
  const [widths, setWidths] = useState<number[] | null>(null)
  const measure = (j: number) => (e: LayoutChangeEvent) => {
    measured.current[j] = Math.ceil(e.nativeEvent.layout.width) + 1
    const all = options.every((_, m) => measured.current[m] > 0)
    if (all && (!widths || widths.some((w, m) => w !== measured.current[m]))) setWidths([...measured.current])
  }

  return (
    <GestureDetector gesture={swipe}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', flexDirection: 'row', opacity: 0, pointerEvents: 'none' }}>
          {options.map((o, j) => <Text key={o.key} numberOfLines={1} style={LABEL} onLayout={measure(j)}>{o.label}</Text>)}
        </View>
        {options.map((o, j) => (
          <Pill key={o.key} o={o} j={j} on={j === shown} width={widths?.[j]} l={l} go={go} chosen={chosen} />
        ))}
      </View>
    </GestureDetector>
  )
}
