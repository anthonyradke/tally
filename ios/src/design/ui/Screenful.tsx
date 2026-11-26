// Activity's list pieces: a day's title, an entry's piece of its day's card, and the screenful at the top of the list
// that a filter switch moves (see activity.tsx). A screenful is a plain stack, not list cells, so the old one and the
// new one can both be on screen at once; each of its items rides the move on the UI thread (swapLook), so nothing
// waits on React mid-move. While a filter's first page is on its way, the screenful is placeholder rows, the shapes
// of entries in gray with a soft pulse, as Apple's apps redact what's still loading.
import { memo, useEffect, type ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type AnimatedStyle, type SharedValue } from 'react-native-reanimated'
import type { PendingTxn, Txn } from '@/lib/api'
import { formatCents } from '@/lib/money'
import { radius, space, usePalette } from '../theme'
import { PendingRow } from './PendingRow'
import { swapLook } from './switching'
import { Txt } from './Txt'
import { TxnRow } from './TxnRow'

/** An entry, or a pending bank row (dimmed, at the top). Entries are passed as they are, so a row whose entry didn't
 *  change keeps its view. */
export interface PendingItem { pending: true; r: PendingTxn }
export type Item = Txn | PendingItem
const isPending = (x: Item): x is PendingItem => (x as PendingItem).pending === true
/** `cont`: the rest of a day the screenful above began (no title, square top corners); `open`: a day that goes on
 *  below the screenful (square bottom corners). */
export interface Day { key: string; title: string; spent: number; data: Item[]; open?: boolean; cont?: boolean }
export const itemKey = (x: Item) => (isPending(x) ? `p${x.r.id}` : String(x.id))

/** The move's shared state: `clock` counts moves (screenful `gen` comes in as it goes from gen - 1 to gen, and leaves
 *  as it goes on to gen + 1); `dir` is the side the current move heads to. */
export interface Swap { clock: SharedValue<number>; dir: SharedValue<number> }

export const DayHeader = memo(function DayHeader({ title, spent }: { title: string; spent: number }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.xl + space.xs, paddingTop: space.xl, paddingBottom: space.s }}>
      <Txt v="subhead" weight="600" tone="label2">{title}</Txt>
      {spent > 0 && <Txt v="subhead" tone="label2" num>{formatCents(spent)}</Txt>}
    </View>
  )
})

/** An entry's piece of its day's card: rounded at the top of the day and at the bottom, a hairline between rows.
 *  Memoized, so a list update re-renders only the rows that changed. */
export const Row = memo(function Row({ x, first, last }: { x: Item; first: boolean; last: boolean }) {
  const p = usePalette()
  return (
    <View style={{ marginHorizontal: space.l, overflow: 'hidden', backgroundColor: p.card, borderCurve: 'continuous',
      borderTopLeftRadius: first ? radius.card : 0, borderTopRightRadius: first ? radius.card : 0,
      borderBottomLeftRadius: last ? radius.card : 0, borderBottomRightRadius: last ? radius.card : 0 }}>
      {!first && <View style={{ height: 0.5, backgroundColor: p.separator, marginLeft: 70 }} />}
      {isPending(x) ? <PendingRow r={x.r} /> : <TxnRow t={x} />}
    </View>
  )
})

/** One item of a screenful on its way in or out: the `i`th from the top, of screenful `gen`. */
function Riding({ swap, gen, i, children }: { swap: Swap; gen: number; i: number; children: ReactNode }) {
  const { clock, dir } = swap
  const style = useAnimatedStyle(() => {
    const c = clock.value
    const s = swapLook(Math.min(1, Math.max(0, c - gen + 1)), Math.min(1, Math.max(0, c - gen)), dir.value, i)
    return { opacity: s.opacity, transform: [{ translateX: s.x }] }
  })
  return <Animated.View style={style}>{children}</Animated.View>
}

/** The top of the list: `days` (already cut to a screenful), or `empty` when there are none. */
export const Screenful = memo(function Screenful({ swap, gen, days, empty }: { swap: Swap; gen: number; days: Day[]; empty: ReactNode }) {
  if (!days.length) return <Riding swap={swap} gen={gen} i={0}>{empty}</Riding>
  let i = 0
  return (
    <View>
      {days.map((d) => (
        <View key={d.key}>
          {!d.cont && <Riding swap={swap} gen={gen} i={i++}><DayHeader title={d.title} spent={d.spent} /></Riding>}
          {d.data.map((x, k) => (
            <Riding key={itemKey(x)} swap={swap} gen={gen} i={i++}>
              <Row x={x} first={k === 0 && !d.cont} last={k === d.data.length - 1 && !d.open} />
            </Riding>
          ))}
        </View>
      ))}
    </View>
  )
})

// Placeholder days: as many rows as a screenful, in two days' cards, with names and amounts of varied lengths.
const SHAPES = [[0.46, 0.3, 64], [0.62, 0.38, 52], [0.38, 0.26, 70], [0.54, 0.34, 58], [0.42, 0.3, 48],
  [0.58, 0.4, 66], [0.36, 0.24, 54], [0.5, 0.32, 72], [0.44, 0.28, 50], [0.6, 0.36, 60], [0.4, 0.3, 56]] as const
const SPLIT = 4

type Breathe = AnimatedStyle<ViewStyle>

function Bar({ w, h, round, breathe }: { w: number | `${number}%`; h: number; round?: boolean; breathe: Breathe }) {
  const p = usePalette()
  return <Animated.View style={[{ width: w, height: h, borderRadius: round ? h / 2 : 6, backgroundColor: p.fill2 }, breathe]} />
}

const SkeletonRow = memo(function SkeletonRow({ shape, first, last, breathe }: { shape: readonly [number, number, number]; first: boolean; last: boolean; breathe: Breathe }) {
  const p = usePalette()
  const [name, sub, amount] = shape
  return (
    <View style={{ marginHorizontal: space.l, overflow: 'hidden', backgroundColor: p.card, borderCurve: 'continuous',
      borderTopLeftRadius: first ? radius.card : 0, borderTopRightRadius: first ? radius.card : 0,
      borderBottomLeftRadius: last ? radius.card : 0, borderBottomRightRadius: last ? radius.card : 0 }}>
      {!first && <View style={{ height: 0.5, backgroundColor: p.separator, marginLeft: 70 }} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: 10, minHeight: 64 }}>
        <Bar w={42} h={42} round breathe={breathe} />
        <View style={{ flex: 1, gap: 8 }}>
          <Bar w={`${Math.round(name * 100)}%`} h={13} breathe={breathe} />
          <Bar w={`${Math.round(sub * 100)}%`} h={11} breathe={breathe} />
        </View>
        <Bar w={amount} h={13} breathe={breathe} />
      </View>
    </View>
  )
})

/** Placeholder rows where a filter's first page will be, their shapes pulsing softly until it comes. */
export const Skeleton = memo(function Skeleton({ swap, gen }: { swap: Swap; gen: number }) {
  const pulse = useSharedValue(1)
  useEffect(() => {
    pulse.set(withRepeat(withTiming(0.5, { duration: 850, easing: Easing.inOut(Easing.sin) }), -1, true))
    return () => cancelAnimation(pulse)
  }, [pulse])
  const breathe = useAnimatedStyle(() => ({ opacity: pulse.value }))
  const days = [SHAPES.slice(0, SPLIT), SHAPES.slice(SPLIT)]
  let i = 0
  return (
    <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
      {days.map((rows, d) => (
        <View key={d}>
          <Riding swap={swap} gen={gen} i={i++}>
            <View style={{ paddingHorizontal: space.xl + space.xs, paddingTop: space.xl + 3, paddingBottom: space.s + 3 }}>
              <Bar w={d === 0 ? 64 : 92} h={14} breathe={breathe} />
            </View>
          </Riding>
          {rows.map((s, k) => (
            <Riding key={k} swap={swap} gen={gen} i={i++}>
              <SkeletonRow shape={s} first={k === 0} last={k === rows.length - 1} breathe={breathe} />
            </Riding>
          ))}
        </View>
      ))}
    </View>
  )
})
