// Home's "Next 30 days": each cash account and card with something scheduled, where it's headed, and its low point.
// A small line shows the path; a cash account that would dip below zero says when, in red.
import { useEffect } from 'react'
import { View } from 'react-native'
import Svg, { Line, Path } from 'react-native-svg'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import type { Bootstrap } from '@/lib/api'
import { useAllTxns } from '@/lib/balances'
import { addDays, fromISO } from '@/lib/dates'
import { AHEAD, outlooks, type Outlook } from '@/lib/forecast'
import { formatCents } from '@/lib/money'
import { space, useTheme } from '@/theme'
import { AccountMark } from './AccountMark'
import { EASE } from './ease'
import { Money } from './Money'
import { Hairline, Panel, Section } from './Panel'
import { Tap } from './Tap'
import { Txt } from './Txt'

const short = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export function Forecast({ b }: { b: Bootstrap }) {
  const all = useAllTxns()
  if (!all.data) return null
  const list = outlooks(b, all.data.items).slice(0, 4)
  if (!list.length) return null
  const out = list.filter((o) => o.a.kind === 'cash').reduce((n, o) => n + o.outflow, 0)
  return (
    <Section title={`Next ${AHEAD} days`} href={{ pathname: '/activity', params: { when: 'upcoming' } }} action="Scheduled">
      <Panel pad={false}>
        {out > 0 && (
          <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l, paddingTop: space.l }}>
            Where each account is headed by {short(addDays(b.today, AHEAD))}, with the {formatCents(out, { cents: false })} already scheduled. Everyday spending comes on top.
          </Txt>
        )}
        {list.map((o, i) => (
          <View key={o.a.id}>
            {i > 0 && <Hairline inset={space.l + 40 + space.m} />}
            <Ahead o={o} first={i === 0 && !out} last={i === list.length - 1} />
          </View>
        ))}
      </Panel>
    </Section>
  )
}

function Ahead({ o, first, last }: { o: Outlook; first: boolean; last: boolean }) {
  const { c } = useTheme()
  const card = o.a.kind === 'card'
  // Net of what's scheduled: for a card, charges add to what's owed.
  const net = card ? o.outflow - o.inflow : o.inflow - o.outflow
  const sub = o.belowZero ? `Below zero on ${short(o.belowZero)}`
    : `${o.count} scheduled, ${formatCents(net, { cents: false, sign: 'always' })}`
  return (
    <Tap feedback="highlight" href={{ pathname: '/account/[id]', params: { id: String(o.a.id) } }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l,
        paddingTop: space.m + (first ? space.xs : 0), paddingBottom: space.m + (last ? space.xs : 0) }}>
      <AccountMark a={o.a} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="row" numberOfLines={1}>{o.a.name}</Txt>
        <Txt variant="sub" tone={o.belowZero ? 'neg' : 'label2'} num numberOfLines={1}>{sub}</Txt>
      </View>
      <Spark values={o.days} color={o.belowZero ? c.neg : c.ink} zero={!card} />
      <Money cents={o.end} whole style={{ minWidth: 64, textAlign: 'right' }} />
    </Tap>
  )
}

/** A tiny path of the balance, drawn in once. A dashed line marks zero when the path crosses it. */
function Spark({ values, color, zero }: { values: number[]; color: string; zero: boolean }) {
  const { c } = useTheme()
  const reduce = useReducedMotion()
  const k = useSharedValue(reduce ? 1 : 0)
  useEffect(() => { if (!reduce) k.set(withTiming(1, { duration: 700, easing: EASE })) }, [k, reduce])
  const reveal = useAnimatedStyle(() => ({ width: W * k.get() }))
  const lo = Math.min(...values, zero && values.some((v) => v < 0) ? 0 : Infinity), hi = Math.max(...values)
  const span = hi - lo || 1
  const y = (v: number) => 3 + (1 - (v - lo) / span) * (H - 6)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * (W - 2) + 1).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const crosses = zero && lo < 0
  return (
    <View style={{ width: W, height: H }}>
      <Animated.View style={[{ height: H, overflow: 'hidden' }, reveal]}>
        <Svg width={W} height={H}>
          {crosses && <Line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke={c.label3} strokeWidth={1} strokeDasharray="2,3" />}
          <Path d={d} stroke={color} strokeWidth={1.75} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </View>
  )
}
const W = 44, H = 24
