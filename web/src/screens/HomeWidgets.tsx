import type { ReactNode } from 'react'
import type { NavigateFunction } from 'react-router'
import { ChevronRight } from 'lucide-react'
import type { Bootstrap, MonthRow, Txn } from '@/api/client'
import type { Lookups } from '@/lib/data'
import type { AddApi } from '@/lib/add'
import { formatCents, pct } from '@/lib/money'
import { monthLabel } from '@/lib/dates'
import { categoryVisual } from '@/icons/categories'
import { Hero } from '@/components/Hero'
import { Amount } from '@/components/Amount'
import { Chip, ChipRow } from '@/components/Chip'
import { Mark } from '@/components/Mark'
import { TxnList } from '@/components/TxnList'
import { LineChart } from '@/components/LineChart'
import s from './Home.module.css'

export type WidgetId = 'networth' | 'stats' | 'quick' | 'ef' | 'roth' | 'budgets' | 'spending' | 'chart' | 'upcoming'
export interface Layout { order: WidgetId[]; hidden: WidgetId[] }
export const DEFAULT_LAYOUT: Layout = { order: ['networth', 'stats', 'quick', 'ef', 'budgets', 'spending', 'upcoming', 'roth', 'chart'], hidden: ['roth', 'chart'] }

export function parseLayout(raw: string | undefined): Layout {
  try {
    const v = raw ? JSON.parse(raw) as Partial<Layout> : {}
    const known = new Set(DEFAULT_LAYOUT.order)
    const order = (v.order ?? []).filter((x): x is WidgetId => known.has(x))
    for (const id of DEFAULT_LAYOUT.order) if (!order.includes(id)) order.push(id)
    return { order, hidden: (v.hidden ?? DEFAULT_LAYOUT.hidden).filter((x): x is WidgetId => known.has(x)) }
  } catch { return DEFAULT_LAYOUT }
}

export interface Ctx { b: Bootstrap; lookups: Lookups; cur: MonthRow; prev?: MonthRow; nav: NavigateFunction; add: AddApi; upcoming: Txn[] }

export const WIDGETS: Record<WidgetId, { label: string; hint: string; render: (c: Ctx) => ReactNode }> = {
  networth: {
    label: 'Net worth', hint: 'The hero figure with its month delta',
    render: ({ cur, prev }) => {
      const delta = prev ? cur.net_worth - prev.net_worth : 0
      return <Hero label="Net worth" cents={cur.net_worth} trailing={prev && (
        <span className={`${s.delta} ${delta >= 0 ? 'pos' : 'neg'}`}>{formatCents(delta, { sign: 'always', cents: false })} <span className={s.deltaLabel}>this month</span></span>)} />
    },
  },
  stats: {
    label: 'Left over & spent', hint: 'This month at a glance',
    render: ({ cur, nav }) => (
      <section className={s.stats}>
        <button type="button" className={s.stat} onClick={() => nav('/insights')}><span className="caps">Left over · {monthLabel(cur.month)}</span><Amount cents={cur.left_over} size="title" tone={cur.left_over >= 0 ? 'pos' : 'neg'} roll /></button>
        <button type="button" className={s.stat} onClick={() => nav('/activity?type=Spending')}><span className="caps">Spent · {monthLabel(cur.month)}</span><Amount cents={cur.spent} size="title" roll /></button>
      </section>
    ),
  },
  quick: {
    label: 'Quick actions', hint: 'One-tap entries',
    render: ({ b, lookups, add }) => b.favorites.length === 0 ? null : (
      <section className={s.section}>
        <h2 className="caps">Quick add</h2>
        <ChipRow className={s.quick}>
          {b.favorites.map((f) => { const c = lookups.cat.get(f.category_id); const v = c && categoryVisual({ ...c, icon: f.icon ?? c.icon, color: f.color ?? c.color })
            return <Chip key={f.id} onClick={() => add.open({ favorite: f })} leading={v && <Mark Icon={v.Icon} color={v.color} size="sm" />}>{f.label}{f.amount ? <span className={`tnum ${s.quickAmt}`}> {formatCents(f.amount)}</span> : null}</Chip> })}
        </ChipRow>
      </section>
    ),
  },
  ef: {
    label: 'Emergency fund', hint: 'Progress toward the goal',
    render: ({ b }) => <Hero compact label="Emergency fund" cents={b.ef.progress} progress={pct(b.ef.progress, b.ef.goal)}
      sub={<>of <span className="tnum">{formatCents(b.ef.goal, { cents: false })}</span> · {Math.round(pct(b.ef.progress, b.ef.goal) * 100)}%</>} />,
  },
  roth: {
    label: 'Roth IRA this year', hint: 'Contributions toward the annual limit',
    render: ({ b }) => <Hero compact label={`Roth IRA · ${new Date().getFullYear()}`} cents={b.roth.ytd} progress={pct(b.roth.ytd, b.roth.limit)}
      sub={<>of <span className="tnum">{formatCents(b.roth.limit, { cents: false })}</span> · {formatCents(Math.max(0, b.roth.limit - b.roth.ytd), { cents: false })} to go</>} />,
  },
  budgets: {
    label: 'Budgets', hint: 'Categories with a monthly target',
    render: ({ b, cur, nav }) => {
      const rows = b.categories.filter((c) => c.type === 'Spending').map((c) => ({ c, budget: b.budgets.find((x) => x.category_id === c.id && x.month === cur.month)?.amount ?? c.budget, amt: cur.by_category[String(c.id)] ?? 0 })).filter((r) => r.budget)
      if (!rows.length) return null
      return (
        <section className={s.section}>
          <button type="button" className={s.sectionHead} onClick={() => nav('/insights')}><h2 className="caps">Budgets · {monthLabel(cur.month)}</h2><ChevronRight className={s.chev} strokeWidth={2} absoluteStrokeWidth /></button>
          <ul className={s.bars}>
            {rows.map(({ c, budget, amt }) => { const v = categoryVisual(c); const over = amt > budget!
              return <li key={c.id}><button type="button" className={s.bar} onClick={() => nav(`/activity?type=Spending&category=${c.id}`)}>
                <Mark Icon={v.Icon} color={v.color} size="sm" />
                <span className={s.barText}><span className={s.barHead}><span className={s.barName}>{c.name}</span><span className={`secondary tnum ${over ? 'neg' : ''}`}>{over ? `over by ${formatCents(amt - budget!, { cents: false })}` : `${formatCents(budget! - amt, { cents: false })} left`}</span></span>
                  <span className={s.track} style={{ '--c': v.color } as React.CSSProperties}><i style={{ transform: `scaleX(${pct(amt, budget!)})`, background: over ? 'var(--neg)' : v.color }} /></span></span>
                <Amount cents={amt} size="small" />
              </button></li> })}
          </ul>
        </section>
      )
    },
  },
  spending: {
    label: 'Spending by category', hint: 'Top categories this month',
    render: ({ b, cur, nav }) => {
      const spending = b.categories.filter((c) => c.type === 'Spending' && (cur.by_category[String(c.id)] ?? 0) > 0).sort((x, y) => (cur.by_category[String(y.id)] ?? 0) - (cur.by_category[String(x.id)] ?? 0))
      if (!spending.length) return null
      return (
        <section className={s.section}>
          <button type="button" className={s.sectionHead} onClick={() => nav('/insights')}><h2 className="caps">Spending · {monthLabel(cur.month)}</h2><ChevronRight className={s.chev} strokeWidth={2} absoluteStrokeWidth /></button>
          <ul className={s.bars}>
            {spending.slice(0, 6).map((c) => { const v = categoryVisual(c); const amt = cur.by_category[String(c.id)] ?? 0
              return <li key={c.id}><button type="button" className={s.bar} onClick={() => nav(`/activity?type=Spending&category=${c.id}`)}>
                <Mark Icon={v.Icon} color={v.color} size="sm" />
                <span className={s.barText}><span className={s.barName}>{c.name}</span><span className={s.track} style={{ '--c': v.color } as React.CSSProperties}><i style={{ transform: `scaleX(${pct(amt, cur.spent)})`, background: v.color }} /></span></span>
                <Amount cents={amt} size="small" />
              </button></li> })}
          </ul>
        </section>
      )
    },
  },
  chart: {
    label: 'Net worth chart', hint: 'Month by month',
    render: ({ b }) => <section className={s.section}><h2 className="caps">Net worth by month</h2><LineChart points={b.months.map((r) => ({ x: r.month, y: r.net_worth }))} height={120} xLabel={(x) => monthLabel(x)} ariaLabel="Net worth by month" /></section>,
  },
  upcoming: {
    label: 'Upcoming', hint: 'Future-dated entries',
    render: ({ b, lookups, upcoming, add }) => upcoming.length === 0 ? null : (
      <section className={s.section}><h2 className="caps">Upcoming</h2><TxnList items={upcoming} boot={b} lookups={lookups} dayTotals={false} onSelect={(t) => add.open({ edit: t })} /></section>
    ),
  },
}
