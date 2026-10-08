// The pages of a month's story (app/story.tsx). Each is full-bleed color with white type: one big figure, a line or
// two around it, and a small picture (bars, a dot calendar, a line). Their parts rise in one after another.
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import Animated, { FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { router } from 'expo-router'
import { categoryVisual } from '@/icons/categories'
import type { MarkSpec } from '@/icons/merchants'
import { addDays, fromISO, lastOfMonth } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { dayName, type Story } from '@/lib/story'
import { radius, space } from '@/theme'
import { EASE } from './ease'
import { Mark } from './Mark'
import { RollingMoney } from './Rolling'
import { Tap } from './Tap'
import { Txt } from './Txt'

/** What the last page's buttons can do; the player provides it. */
export const StoryControls = createContext<{ replay: () => void }>({ replay: () => {} })

export interface Page { key: string; colors: readonly [string, string]; node: ReactNode; celebrate?: boolean }

const WHITE = '#FFFFFF'
const SOFT = 'rgba(255,255,255,0.72)'
const name = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'long' })
const pct = (k: number) => `${Math.round(k * 100)}%`

/** Rises into place `at` ms after the page appears. */
function Rise({ at = 0, children }: { at?: number; children: ReactNode }) {
  const reduce = useReducedMotion()
  return <Animated.View entering={reduce ? undefined : FadeInDown.delay(at).duration(520).easing(EASE)}>{children}</Animated.View>
}
const Kicker = ({ children }: { children: string }) => <Txt variant="headline" style={{ color: SOFT, fontSize: 19 }}>{children}</Txt>
const Big = ({ cents, sign }: { cents: number; sign?: 'always' }) =>
  <RollingMoney cents={cents} whole sign={sign} replay style={{ fontSize: 64, fontWeight: '800', letterSpacing: -2, color: WHITE }} />
const Line = ({ children, strong }: { children: ReactNode; strong?: boolean }) =>
  <Txt variant="title2" style={{ color: strong ? WHITE : SOFT, fontWeight: strong ? '700' : '600', lineHeight: 30 }}>{children}</Txt>

/** A bar that grows to `k` (0..1) once the page is up. */
function Grow({ k, at, color = WHITE, h = 14 }: { k: number; at: number; color?: string; h?: number }) {
  const reduce = useReducedMotion()
  const w = useSharedValue(reduce ? k : 0)
  useEffect(() => { if (!reduce) w.set(withDelay(at, withTiming(k, { duration: 900, easing: EASE }))) }, [w, k, at, reduce])
  const style = useAnimatedStyle(() => ({ width: `${Math.max(0.02, w.get()) * 100}%` }))
  return (
    <View style={{ height: h, borderRadius: h / 2, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
      <Animated.View style={[{ height: h, borderRadius: h / 2, backgroundColor: color }, style]} />
    </View>
  )
}

export function storyPages(s: Story, opts: { markFor: (what: string) => MarkSpec | null; today: string }): Page[] {
  const { m, prev } = s
  const month = name(m.month)
  const going = m.month === opts.today.slice(0, 7) + '-01'
  const pages: Page[] = []

  pages.push({ key: 'intro', colors: ['#1B1464', '#6A4DF4'], node: (
    <View style={{ gap: space.l }}>
      <Rise><Kicker>Your month in Tally</Kicker></Rise>
      <Rise at={150}><Txt numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 72, fontWeight: '800', letterSpacing: -2.5, color: WHITE }}>{month}</Txt></Rise>
      <Rise at={350}><Line>{s.entries} {s.entries === 1 ? 'entry' : 'entries'} logged{going ? ' so far' : ''}. Tap through, or hold to pause.</Line></Rise>
    </View>
  ) })

  if (m.money_in || m.spent) {
    const max = Math.max(m.money_in, m.spent, 1)
    pages.push({ key: 'flow', colors: ['#063B2C', '#178A5B'], node: (
      <View style={{ gap: space.xl }}>
        <Rise><Kicker>{`In ${month}`}</Kicker></Rise>
        <Rise at={150}><View style={{ gap: space.s }}><Big cents={m.money_in} /><Line>came in</Line><Grow k={m.money_in / max} at={400} /></View></Rise>
        <Rise at={700}><View style={{ gap: space.s }}><Big cents={m.spent} /><Line>went to spending</Line><Grow k={m.spent / max} at={950} color="rgba(255,255,255,0.75)" /></View></Rise>
      </View>
    ) })
  }

  if (m.money_in > 0) {
    const up = m.left_over >= 0
    pages.push({ key: 'kept', celebrate: up && !going, colors: up ? ['#00524A', '#12B5A1'] : ['#5A1F00', '#E5671F'], node: (
      <View style={{ gap: space.l }}>
        <Rise><Kicker>{up ? 'You kept' : 'You went over by'}</Kicker></Rise>
        <Rise at={150}><Big cents={Math.abs(m.left_over)} /></Rise>
        <Rise at={400}><Line strong>{up && s.kept != null ? `${pct(s.kept)} of everything that came in.` : 'More went out than came in.'}</Line></Rise>
        <Rise at={600}><Line>{up ? 'That is after spending, loan payments and saving.' : `Loan payments and saving count here too. ${going ? 'There is still time.' : 'A fresh month is a clean slate.'}`}</Line></Rise>
      </View>
    ) })
  }

  if (s.top.length) {
    const lead = s.top[0]
    const v = categoryVisual(lead.c)
    pages.push({ key: 'top', colors: TINT_PAGES[v.tint] ?? TINT_PAGES.gray, node: <Top s={s} /> })
  }

  if (s.biggestDay) {
    const d = s.biggestDay
    pages.push({ key: 'day', colors: ['#5B0F3A', '#E0457B'], node: (
      <View style={{ gap: space.l }}>
        <Rise><Kicker>Your biggest day</Kicker></Rise>
        <Rise at={150}><Line strong>{dayName(d.date)}</Line></Rise>
        <Rise at={300}><Big cents={d.cents} /></Rise>
        <View style={{ gap: space.s }}>
          {d.rows.map((t, i) => (
            <Rise key={t.id} at={550 + i * 120}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.m }}>
                <Txt variant="headline" numberOfLines={1} style={{ color: WHITE, flexShrink: 1 }}>{t.what || 'Entry'}</Txt>
                <Txt variant="headline" num style={{ color: SOFT }}>{formatCents(t.amount)}</Txt>
              </View>
            </Rise>
          ))}
        </View>
      </View>
    ) })
  }

  if (s.favorite) {
    const f = s.favorite
    const mark = opts.markFor(f.what)
    pages.push({ key: 'regular', colors: ['#0B2A6B', '#2F7BF2'], node: (
      <View style={{ gap: space.l }}>
        <Rise><Kicker>Your regular</Kicker></Rise>
        <Rise at={150}>{mark ? <Mark kind="spec" spec={mark} size={96} /> : <Mark kind="glyph" sf="storefront.fill" md="storefront" tint="rgba(255,255,255,0.2)" size={96} />}</Rise>
        <Rise at={300}><Txt style={{ fontSize: 44, fontWeight: '800', letterSpacing: -1.2, color: WHITE }} numberOfLines={2}>{f.what}</Txt></Rise>
        <Rise at={450}><Line strong>{f.visits} visits, {formatCents(f.cents)} in all.</Line></Rise>
      </View>
    ) })
  }

  if (s.quiet.of > 0) {
    pages.push({ key: 'quiet', colors: ['#14213D', '#3D5A80'], node: <Quiet s={s} going={going} /> })
  }

  if (prev && s.vs && s.vs.before > 0) {
    const change = (s.vs.now - s.vs.before) / s.vs.before
    const less = change <= 0
    pages.push({ key: 'compare', colors: less ? ['#1D3B0F', '#5A9E2F'] : ['#3D1E00', '#C77800'], node: (
      <View style={{ gap: space.l }}>
        <Rise><Kicker>{`Against ${name(prev.month)}`}</Kicker></Rise>
        <Rise at={150}><Txt style={{ fontSize: 64, fontWeight: '800', letterSpacing: -2, color: WHITE }}>{less ? '−' : '+'}{pct(Math.abs(change))}</Txt></Rise>
        <Rise at={300}><Line strong>{less ? 'less spending' : 'more spending'}{going ? ` than ${name(prev.month)} 1–${Number(opts.today.slice(8))}` : ''}.</Line></Rise>
        <View style={{ gap: space.m, marginTop: space.s }}>
          {s.movers.up && <Rise at={500}><Mover c={s.movers.up.c} by={s.movers.up.by} /></Rise>}
          {s.movers.down && <Rise at={650}><Mover c={s.movers.down.c} by={s.movers.down.by} /></Rise>}
        </View>
      </View>
    ) })
  }

  if (s.worth && s.worth.values.length >= 2) {
    const w = s.worth
    pages.push({ key: 'worth', colors: w.change >= 0 ? ['#251050', '#8A5CF6'] : ['#2A1B3D', '#6B5B95'], node: (
      <View style={{ gap: space.l }}>
        <Rise><Kicker>Net worth</Kicker></Rise>
        <Rise at={150}><Big cents={w.change} sign="always" /></Rise>
        <Rise at={300}><Line strong>{w.change >= 0 ? `up over ${month}.` : `down over ${month}.`}</Line></Rise>
        <Rise at={450}><Spark values={w.values} /></Rise>
      </View>
    ) })
  }

  if (s.budgets) {
    const bu = s.budgets
    pages.push({ key: 'budgets', celebrate: bu.kept === bu.of && !going, colors: ['#3A0F5E', '#B14AE0'], node: (
      <View style={{ gap: space.l }}>
        <Rise><Kicker>Budgets</Kicker></Rise>
        <Rise at={150}><Txt style={{ fontSize: 64, fontWeight: '800', letterSpacing: -2, color: WHITE }}>{bu.kept} of {bu.of}</Txt></Rise>
        <Rise at={300}><Line strong>{bu.kept === bu.of ? 'Every budget kept.' : `kept${going ? ' so far' : ''}.`}</Line></Rise>
        <Rise at={450}><Grow k={bu.kept / bu.of} at={600} /></Rise>
      </View>
    ) })
  }

  pages.push({ key: 'end', colors: ['#111111', '#3A3A3C'], node: <End label={month} going={going} /> })
  return pages
}

const TINT_PAGES: Record<string, readonly [string, string]> = {
  red: ['#5C0F0B', '#F2453D'], orange: ['#5A2400', '#F57C1F'], amber: ['#4D3600', '#D99A00'], green: ['#0B3D18', '#22B04F'],
  teal: ['#003D39', '#00A396'], blue: ['#0B2A6B', '#1F7BF2'], violet: ['#251050', '#8A5CF6'], pink: ['#5C0B30', '#EC3F8C'],
  gray: ['#1C1C1E', '#636366'],
}

function Top({ s }: { s: Story }) {
  const lead = s.top[0]
  const v = categoryVisual(lead.c)
  return (
    <View style={{ gap: space.l }}>
      <Rise><Kicker>Most of it went to</Kicker></Rise>
      <Rise at={150}><Mark kind="glyph" sf={v.sf} md={v.md} tint="rgba(255,255,255,0.22)" size={88} /></Rise>
      <Rise at={300}><Txt style={{ fontSize: 48, fontWeight: '800', letterSpacing: -1.5, color: WHITE }} numberOfLines={2}>{lead.c.name}</Txt></Rise>
      <Rise at={450}><Line strong>{formatCents(lead.cents, { cents: false })}, {pct(lead.share)} of your spending.</Line></Rise>
      <View style={{ gap: space.m, marginTop: space.s }}>
        {s.top.slice(1).map((x, i) => (
          <Rise key={x.c.id} at={650 + i * 150}>
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt variant="headline" style={{ color: WHITE }}>{x.c.name}</Txt>
                <Txt variant="headline" num style={{ color: SOFT }}>{formatCents(x.cents, { cents: false })}</Txt>
              </View>
              <Grow k={x.cents / lead.cents} at={800 + i * 150} h={8} />
            </View>
          </Rise>
        ))}
      </View>
    </View>
  )
}

/** The month as a calendar of dots: filled on days with spending, hollow on quiet ones. */
function Quiet({ s, going }: { s: Story; going: boolean }) {
  const first = fromISO(s.m.month)
  const lead = (first.getDay() + 6) % 7 // weeks start on Monday
  const end = lastOfMonth(s.m.month)
  const days: string[] = []
  for (let d = s.m.month; d <= end; d = addDays(d, 1)) days.push(d)
  const spentOn = s.spentDays
  return (
    <View style={{ gap: space.l }}>
      <Rise><Kicker>Quiet days</Kicker></Rise>
      <Rise at={150}><Txt style={{ fontSize: 64, fontWeight: '800', letterSpacing: -2, color: WHITE }}>{s.quiet.days}</Txt></Rise>
      <Rise at={300}><Line strong>{s.quiet.days === 1 ? 'day' : 'days'} without spending{going ? ' so far' : ''}. Your longest run was {s.quiet.streak} {s.quiet.streak === 1 ? 'day' : 'days'}.</Line></Rise>
      <Rise at={500}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 7 * 34, gap: 0 }}>
          {Array.from({ length: lead }, (_, i) => <View key={`l${i}`} style={{ width: 34, height: 34 }} />)}
          {days.map((d, i) => (
            <View key={d} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, opacity: i < s.quiet.of ? 1 : 0.3,
                backgroundColor: spentOn.has(d) ? WHITE : 'transparent', borderWidth: 2, borderColor: spentOn.has(d) ? WHITE : 'rgba(255,255,255,0.55)' }} />
            </View>
          ))}
        </View>
      </Rise>
    </View>
  )
}

function Mover({ c, by }: { c: Story['top'][number]['c']; by: number }) {
  const v = categoryVisual(c)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
      <Mark kind="glyph" sf={v.sf} md={v.md} tint="rgba(255,255,255,0.22)" size={40} />
      <Txt variant="headline" style={{ color: WHITE, flex: 1 }} numberOfLines={1}>{c.name}</Txt>
      <Txt variant="headline" num style={{ color: WHITE }}>{by > 0 ? '+' : '−'}{formatCents(Math.abs(by), { cents: false })}</Txt>
    </View>
  )
}

function Spark({ values }: { values: number[] }) {
  const W = 300, H = 110
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * (W - 8) + 4).toFixed(1)},${(4 + (1 - (v - lo) / span) * (H - 8)).toFixed(1)}`).join('')
  return <Svg width={W} height={H}><Path d={d} stroke={WHITE} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
}

function End({ label, going }: { label: string; going: boolean }) {
  const { replay } = useContext(StoryControls)
  return (
    <View style={{ gap: space.xl }}>
      <Rise><Txt style={{ fontSize: 56, fontWeight: '800', letterSpacing: -2, color: WHITE }}>{going ? `${label}, so far.` : `That was ${label}.`}</Txt></Rise>
      <Rise at={200}><Line>{going ? 'Come back when it ends for the whole story.' : 'See you at the end of the next one.'}</Line></Rise>
      <Rise at={400}>
        <View style={{ flexDirection: 'row', gap: space.s }}>
          <Pill label="Done" onPress={() => router.back()} solid />
          <Pill label="Watch again" onPress={replay} />
        </View>
      </Rise>
    </View>
  )
}

function Pill({ label, onPress, solid }: { label: string; onPress: () => void; solid?: boolean }) {
  return (
    <Tap onPress={onPress} style={{ height: 48, paddingHorizontal: space.xl, borderRadius: radius.pill, justifyContent: 'center',
      backgroundColor: solid ? WHITE : 'rgba(255,255,255,0.18)' }}>
      <Txt variant="headline" style={{ color: solid ? '#000000' : WHITE }}>{label}</Txt>
    </Tap>
  )
}
