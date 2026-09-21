import { useState } from 'react'
import type { NavigateFunction } from 'react-router'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { Bootstrap, MonthRow } from '@/api/client'
import type { Pace } from '@/lib/pace'
import { formatCents } from '@/lib/money'
import { fromISO, monthLabel } from '@/lib/dates'
import { Amount } from '@/components/Amount'
import { Hero } from '@/components/Hero'
import { Panel, Section } from '@/components/Panel'
import { ScrubChart } from '@/components/ScrubChart'
import s from './Home.module.css'

const monthName = (iso: string, style: 'long' | 'short' = 'long') => fromISO(iso).toLocaleDateString('en-US', { month: style })

export function Delta({ cents, suffix }: { cents: number; suffix?: string }) {
  const up = cents >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`${s.pill} ${up ? s.pillPos : s.pillNeg}`}>
      <Icon strokeWidth={2.5} absoluteStrokeWidth />{formatCents(Math.abs(cents), { cents: false })}{suffix && <span className={s.pillSuffix}>{suffix}</span>}
    </span>
  )
}

/** Net worth figure; once there are 3+ months, a scrubbable month-by-month chart under it rolls the figure. */
export function NetWorthHero({ b, cur, prev }: { b: Bootstrap; cur: MonthRow; prev?: MonthRow }) {
  const [at, setAt] = useState<number | null>(null)
  const m = at === null ? cur : b.months[at]
  const before = at === null ? prev : b.months[at - 1]
  const delta = before ? m.net_worth - before.net_worth : null
  return (
    <div className={s.heroBlock}>
      <Hero label={at === null ? 'Net worth' : `Net worth, ${monthLabel(m.month, 'long')}`} cents={m.net_worth} tone="neutral"
        sub={delta !== null && <span className={s.deltaRow}><Delta cents={delta} /><span>{at === null ? 'this month' : `in ${monthName(m.month)}`}</span></span>} />
      {b.months.length >= 3 && (
        <ScrubChart series={b.months.map((r) => r.net_worth)} slots={b.months.length} height={140} onScrub={setAt}
          startLabel={monthLabel(b.months[0].month)} endLabel={monthLabel(cur.month)} ariaLabel="Net worth by month; drag to see each month" />
      )}
    </div>
  )
}

/** This month at a glance: spent so far with a scrubbable pace chart against last month, then left over / money in. */
export function MonthPanel({ cur, pace, nav }: { cur: MonthRow; pace: Pace | null; nav: NavigateFunction }) {
  const [at, setAt] = useState<number | null>(null)
  const name = monthName(cur.month), short = monthName(cur.month, 'short'), prevName = pace ? monthName(pace.prevMonth) : ''
  const i = pace ? at ?? pace.cur.length - 1 : 0
  const spent = pace ? pace.cur[i] : cur.spent
  const diff = pace ? spent - pace.prev[i] : 0
  return (
    <Section title={name} action="Insights" onAction={() => nav('/insights')}>
      <Panel>
        <div className="label">{at === null ? 'Spent so far' : `Spent through ${short} ${i + 1}`}</div>
        <div className={s.monthFigure}><Amount cents={spent} size="title" roll /></div>
        {pace && (
          <>
            <div className={s.paceLine}>
              <span className={`${s.pill} ${diff <= 0 ? s.pillPos : s.pillNeg}`}>{formatCents(Math.abs(diff), { cents: false })} {diff <= 0 ? 'less' : 'more'}</span>
              <span className="secondary">than {prevName} by day {i + 1}</span>
            </div>
            <div className={s.chart}>
              <ScrubChart series={pace.cur} compare={pace.prev} slots={pace.days} onScrub={setAt}
                startLabel={`${short} 1`} endLabel={`${short} ${pace.days}`} ariaLabel={`Spending so far in ${name} against ${prevName}; drag to compare by day`} />
            </div>
            <div className={s.legend} aria-hidden><span><i className={s.keyCur} />{name}</span><span><i className={s.keyPrev} />{prevName}</span></div>
          </>
        )}
        <div className={s.statRow}>
          <button type="button" className={s.stat} onClick={() => nav('/insights')}>
            <span className="label">Left over</span><Amount cents={cur.left_over} size="body" tone={cur.left_over >= 0 ? 'pos' : 'neg'} roll />
          </button>
          <button type="button" className={s.stat} onClick={() => nav('/activity?type=Money+in')}>
            <span className="label">Money in</span><Amount cents={cur.money_in} size="body" roll />
          </button>
          {pace && pace.scheduled > 0 && (
            <button type="button" className={s.stat} onClick={() => nav('/activity')}>
              <span className="label">Scheduled</span><Amount cents={pace.scheduled} size="body" roll />
            </button>
          )}
        </div>
      </Panel>
    </Section>
  )
}
