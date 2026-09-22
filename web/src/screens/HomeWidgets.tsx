import type { ReactNode } from 'react'
import type { NavigateFunction } from 'react-router'
import type { Bootstrap, MonthRow, Txn } from '@/api/client'
import type { Lookups } from '@/lib/data'
import type { AddApi } from '@/lib/add'
import type { Pace } from '@/lib/pace'
import { formatCents, pct } from '@/lib/money'
import { categoryVisual } from '@/icons/categories'
import { Amount } from '@/components/Amount'
import { Chip, ChipRow } from '@/components/Chip'
import { Mark } from '@/components/Mark'
import { TxnList } from '@/components/TxnList'
import { LineChart } from '@/components/LineChart'
import { Panel, Section } from '@/components/Panel'
import { ProgressBar } from '@/components/ProgressBar'
import { BudgetMeter } from '@/components/BudgetMeter'
import { budgetFor, suggestBudgets } from '@/lib/budgets'
import { BudgetSetup } from './BudgetSetup'
import { MonthReview } from './MonthReview'
import { monthLabel } from '@/lib/dates'
import { MonthPanel, NetWorthHero } from './HomeMonth'
import s from './Home.module.css'

export type WidgetId = 'review' | 'networth' | 'stats' | 'quick' | 'ef' | 'roth' | 'budgets' | 'spending' | 'chart' | 'upcoming' | 'recent'
export interface Layout { order: WidgetId[]; hidden: WidgetId[] }
export const DEFAULT_LAYOUT: Layout = { order: ['networth', 'review', 'stats', 'quick', 'budgets', 'spending', 'ef', 'upcoming', 'recent', 'roth', 'chart'], hidden: ['roth', 'chart'] }

export function parseLayout(raw: string | undefined): Layout {
  try {
    const v = raw ? JSON.parse(raw) as Partial<Layout> : {}
    const known = new Set(DEFAULT_LAYOUT.order)
    const order = (v.order ?? []).filter((x): x is WidgetId => known.has(x))
    // Widgets added since the layout was saved go in at their default position (the review card sits under net worth).
    DEFAULT_LAYOUT.order.forEach((id, i) => { if (!order.includes(id)) order.splice(Math.min(i, order.length), 0, id) })
    return { order, hidden: (v.hidden ?? DEFAULT_LAYOUT.hidden).filter((x): x is WidgetId => known.has(x)) }
  } catch { return DEFAULT_LAYOUT }
}

export interface Ctx { b: Bootstrap; lookups: Lookups; cur: MonthRow; prev?: MonthRow; months: MonthRow[]; nav: NavigateFunction; add: AddApi; upcoming: Txn[]; recent: Txn[]; pace: Pace | null }

const pctText = (p: number) => (p > 0 && p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`)

const spendRows = (b: Bootstrap, cur: MonthRow) => b.categories
  .filter((c) => c.type === 'Spending' && (cur.by_category[String(c.id)] ?? 0) > 0)
  .map((c) => ({ c, v: categoryVisual(c), amt: cur.by_category[String(c.id)] ?? 0 }))
  .sort((x, y) => y.amt - x.amt)

export const WIDGETS: Record<WidgetId, { label: string; hint: string; render: (c: Ctx) => ReactNode }> = {
  review: {
    label: 'Month in review', hint: 'Last month at a glance, for the first week',
    render: ({ b, nav }) => <MonthReview b={b} nav={nav} />,
  },
  networth: {
    label: 'Net worth', hint: 'The big figure and its change this month',
    render: ({ months, cur, prev }) => <NetWorthHero months={months} cur={cur} prev={prev} />,
  },
  stats: {
    label: 'This month', hint: 'Spending pace against last month',
    render: ({ cur, pace, nav }) => <MonthPanel cur={cur} pace={pace} nav={nav} />,
  },
  quick: {
    label: 'Quick add', hint: 'One-tap entries',
    render: ({ b, lookups, add }) => b.favorites.length === 0 ? null : (
      <Section title="Quick add">
        <ChipRow>
          {b.favorites.map((f) => { const c = lookups.cat.get(f.category_id); const v = c && categoryVisual({ ...c, icon: f.icon ?? c.icon, color: f.color ?? c.color })
            return <Chip key={f.id} onClick={() => add.open({ favorite: f })} leading={v && <Mark Icon={v.Icon} color={v.color} size="sm" />}>{f.label}{f.amount ? <span className={`tnum ${s.quickAmt}`}> {formatCents(f.amount)}</span> : null}</Chip> })}
        </ChipRow>
      </Section>
    ),
  },
  budgets: {
    label: 'Budgets', hint: 'Categories with a monthly target',
    render: ({ b, cur, nav }) => {
      const rows = b.categories.filter((c) => c.type === 'Spending' && c.active).map((c) => ({ c, v: categoryVisual(c), budget: budgetFor(b, c, cur.month), amt: cur.by_category[String(c.id)] ?? 0 })).filter((r) => r.budget)
      if (!rows.length) return suggestBudgets(b).length === 0 ? null : (
        <Section title="Budgets">
          <BudgetSetup trigger={(open) => (
            <Panel onClick={open}>
              <div className={s.setupHead}>Set monthly budgets</div>
              <div className="secondary">Tally suggests a target for each category from what you usually spend. One tap to accept.</div>
            </Panel>
          )} />
        </Section>
      )
      return (
        <Section title="Budgets" onAction={() => nav('/insights')}>
          <Panel flush>
            {rows.map(({ c, v, budget, amt }) => (
              <button key={c.id} type="button" className={s.row} onClick={() => nav(`/activity?type=Spending&category=${c.id}`)}>
                <Mark Icon={v.Icon} color={v.color} size="sm" />
                <span className={s.rowMain}>
                  <span className={s.rowHead}><span className={s.rowName}>{c.name}</span><Amount cents={amt} size="small" /></span>
                  <BudgetMeter name={c.name} spent={amt} budget={budget!} color={v.color} month={cur.month} today={b.today} />
                </span>
              </button>))}
          </Panel>
        </Section>
      )
    },
  },
  spending: {
    label: 'Spending by category', hint: 'Where this month went',
    render: ({ b, cur, nav }) => {
      const rows = spendRows(b, cur)
      if (!rows.length) return null
      return (
        <Section title="Spending" onAction={() => nav('/insights')}>
          <Panel flush>
            <div className={s.stack} role="img" aria-label="Share of spending by category">
              {rows.map(({ c, v, amt }) => <i key={c.id} style={{ flexGrow: amt, background: v.color }} />)}
            </div>
            {rows.slice(0, 5).map(({ c, v, amt }) => (
              <button key={c.id} type="button" className={s.row} onClick={() => nav(`/activity?type=Spending&category=${c.id}`)}>
                <Mark Icon={v.Icon} color={v.color} size="sm" />
                <span className={s.rowMain}><span className={s.rowName}>{c.name}</span><span className="secondary tnum">{Math.round(pct(amt, cur.spent) * 100)}% of spending</span></span>
                <Amount cents={amt} size="body" />
              </button>
            ))}
          </Panel>
        </Section>
      )
    },
  },
  ef: {
    label: 'Emergency fund', hint: 'Progress toward the goal',
    render: ({ b, nav }) => {
      const p = pct(b.ef.progress, b.ef.goal)
      return (
        <Section title="Emergency fund">
          <Panel onClick={() => nav('/accounts')}>
            <div className={s.goalHead}><Amount cents={b.ef.progress} size="title" roll /><span className={s.goalPct}>{pctText(p)}</span></div>
            <ProgressBar value={p} color="var(--pos)" label="Emergency fund progress" />
            <div className={`secondary tnum ${s.goalFoot}`}>{b.ef.goal > b.ef.progress ? `${formatCents(b.ef.goal - b.ef.progress, { cents: false })} to go of ${formatCents(b.ef.goal, { cents: false })}` : `Goal of ${formatCents(b.ef.goal, { cents: false })} reached`}</div>
          </Panel>
        </Section>
      )
    },
  },
  roth: {
    label: 'Roth IRA this year', hint: 'Contributions toward the annual limit',
    render: ({ b }) => {
      const p = pct(b.roth.ytd, b.roth.limit)
      return (
        <Section title={`Roth IRA ${new Date().getFullYear()}`}>
          <Panel>
            <div className={s.goalHead}><Amount cents={b.roth.ytd} size="title" roll /><span className={s.goalPct}>{pctText(p)}</span></div>
            <ProgressBar value={p} color="var(--bank-roth)" label="Roth IRA contributions" />
            <div className={`secondary tnum ${s.goalFoot}`}>{formatCents(Math.max(0, b.roth.limit - b.roth.ytd), { cents: false })} left of the {formatCents(b.roth.limit, { cents: false })} limit</div>
          </Panel>
        </Section>
      )
    },
  },
  chart: {
    label: 'Net worth chart', hint: 'Month by month',
    render: ({ months }) => <Section title="Net worth by month"><Panel><LineChart points={months.map((r) => ({ x: r.month, y: r.net_worth }))} height={140} xLabel={(x) => monthLabel(x)} ariaLabel="Net worth by month" /></Panel></Section>,
  },
  upcoming: {
    label: 'Upcoming', hint: 'Future-dated entries',
    render: ({ b, lookups, upcoming, add }) => upcoming.length === 0 ? null : (
      <Section title="Upcoming"><Panel flush><TxnList items={upcoming} boot={b} lookups={lookups} dayTotals={false} onSelect={(t) => add.open({ edit: t })} /></Panel></Section>
    ),
  },
  recent: {
    label: 'Recent', hint: 'The last few entries',
    render: ({ b, lookups, recent, add, nav }) => recent.length === 0 ? null : (
      <Section title="Recent" onAction={() => nav('/activity')}><Panel flush><TxnList items={recent} boot={b} lookups={lookups} dayTotals={false} onSelect={(t) => add.open({ edit: t })} /></Panel></Section>
    ),
  },
}
