// Home's "Next 30 days": each cash account and card with something scheduled, where it's headed, and its low point.
// A small line shows the path; a cash account that would dip below zero says when, in red. Coming up (below) lists
// the next few scheduled entries; with both on Home, these rows sit at its top, so the same bills show once.
import { useEffect } from 'react'
import { View } from 'react-native'
import Svg, { Line, Path } from 'react-native-svg'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import type { Bootstrap } from '@/lib/api'
import { useAllTxns } from '@/lib/balances'
import { addDays, fromISO } from '@/lib/dates'
import { useTransactions } from '@/lib/data'
import { aheadLine, AHEAD, outlooks, scheduledSpend, sharedSpan, type Outlook } from '@/lib/forecast'
import { formatCents } from '@/lib/money'
import { useTally } from '@/lib/tally'
import { space, useTheme } from '@/theme'
import { AccountMark } from './AccountMark'
import { EASE } from './ease'
import { FootLink } from './FootLink'
import { Money } from './Money'
import { Hairline, Panel, Section } from './Panel'
import { Tap } from './Tap'
import { TxnRow } from './TxnRow'
import { Txt } from './Txt'

const short = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** The accounts with something scheduled in the next 30 days and the spending scheduled in them, or null while the
 *  rows load (or when not `enabled`: it reads the whole ledger). */
export function useOutlooks(b: Bootstrap, enabled = true): { list: Outlook[]; spend: number } | null {
  const all = useAllTxns(enabled)
  return all.data ? { list: outlooks(b, all.data.items).slice(0, 4), spend: scheduledSpend(b, all.data.items) } : null
}

/** Home's Coming up: the next few scheduled entries, and with `paths` each account's next 30 days above them. Next 30
 *  days and Coming up used to be two sections listing the same bills. Starts tomorrow: from today, a busy day's
 *  entries filled the rows and hid what's coming. */
export function ComingUp({ b, paths }: { b: Bootstrap; paths: boolean }) {
  const t = useTally()
  const out = useOutlooks(b, paths)
  const q = useTransactions({ start: addDays(b.today, 1), end: addDays(b.today, AHEAD), sort: 'date', dir: 'asc', limit: 6 })
  // With paths, nothing shows until they're known: 4 rows first dropped to 3 when the account lines came in.
  if (paths && !out) return null
  const ahead = paths && out ? out.list : []
  const rows = (q.data?.items ?? []).slice(0, ahead.length ? 3 : 4)
  if (!rows.length && !ahead.length) return null
  return (
    <Section title="Coming up" href={{ pathname: '/activity', params: { when: 'upcoming' } }}>
      <Panel pad={false}>
        {ahead.length > 0 && <ForecastRows b={b} list={ahead} spend={out?.spend ?? 0} closes={!rows.length} />}
        {rows.map((x, i) => (
          <View key={x.id}>
            {(i > 0 || ahead.length > 0) && <Hairline inset={i > 0 ? space.l + 40 + space.m : 0} />}
            <TxnRow t={x} c={t.catOf(x)} acct={t.acct} mark={t.markFor(x.what)} today={b.today} showDate={short(x.date)}
              padTop={i === 0 && !ahead.length ? space.xs : 0} padBottom={i === rows.length - 1 ? space.xs : 0} />
          </View>
        ))}
      </Panel>
      <FootLink label="Manage recurring" href="/settings/recurring" sf="repeat" md="repeat" />
    </Section>
  )
}

/** Next 30 days as a section of its own, when Home's layout leaves Coming up off. */
export function Forecast({ b }: { b: Bootstrap }) {
  const out = useOutlooks(b)
  if (!out?.list.length) return null
  return (
    <Section title={`Next ${AHEAD} days`} href={{ pathname: '/activity', params: { when: 'upcoming' } }} action="Scheduled">
      <Panel pad={false}><ForecastRows b={b} list={out.list} spend={out.spend} closes /></Panel>
    </Section>
  )
}

/** A line on what's already scheduled, then a row per account, every small line on the same scale. `spend`: the
 *  spending scheduled in the window (`scheduledSpend`), the figure See all's list totals too. `closes`: these rows end
 *  the panel, so the last one pads its bottom. */
export function ForecastRows({ b, list, spend, closes }: { b: Bootstrap; list: Outlook[]; spend: number; closes?: boolean }) {
  const span = sharedSpan(list)
  return (
    <>
      {spend > 0 && (
        <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l, paddingTop: space.l }}>
          Where each account is headed by {short(addDays(b.today, AHEAD))}, with {formatCents(spend)} of spending already scheduled. Everyday spending comes on top.
        </Txt>
      )}
      {list.map((o, i) => (
        <View key={o.a.id}>
          {i > 0 && <Hairline inset={space.l + 40 + space.m} />}
          <Ahead o={o} span={span} first={i === 0 && !(spend > 0)} last={!!closes && i === list.length - 1} />
        </View>
      ))}
    </>
  )
}

function Ahead({ o, span, first, last }: { o: Outlook; span: number; first: boolean; last: boolean }) {
  const { c } = useTheme()
  const card = o.a.kind === 'card'
  return (
    <Tap feedback="highlight" href={{ pathname: '/account/[id]', params: { id: String(o.a.id) } }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l,
        paddingTop: space.m + (first ? space.xs : 0), paddingBottom: space.m + (last ? space.xs : 0) }}>
      <AccountMark a={o.a} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="row" numberOfLines={1}>{o.a.name}</Txt>
        <Txt variant="sub" tone={o.belowZero ? 'neg' : 'label2'} num numberOfLines={1}>{aheadLine(o)}</Txt>
      </View>
      <Spark values={o.days} span={span} color={o.belowZero ? c.neg : c.ink} zero={!card} />
      {/* A card's figure is what's owed by then; one paid past zero is a credit. */}
      <View style={{ minWidth: 64, alignItems: 'flex-end' }}>
        <Money cents={card ? Math.abs(o.end) : o.end} whole />
        {card && <Txt variant="foot" tone="label2">{o.end < 0 ? 'credit' : 'owed'}</Txt>}
      </View>
    </Tap>
  )
}

/** A tiny path of the balance, drawn in once, on the scale every row shares (`span`, the biggest swing among them):
 *  a $12 charge stays a small step beside $1,400 of rent. A dashed line marks zero when the path crosses it. */
function Spark({ values, span, color, zero }: { values: number[]; span: number; color: string; zero: boolean }) {
  const { c } = useTheme()
  const reduce = useReducedMotion()
  const k = useSharedValue(reduce ? 1 : 0)
  useEffect(() => { if (!reduce) k.set(withTiming(1, { duration: 700, easing: EASE })) }, [k, reduce])
  const reveal = useAnimatedStyle(() => ({ width: W * k.get() }))
  const lo = Math.min(...values), hi = Math.max(...values)
  const mid = (lo + hi) / 2
  const y = (v: number) => H / 2 - ((v - mid) / span) * (H - 6)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * (W - 2) + 1).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const crosses = zero && lo < 0 && hi >= 0
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
