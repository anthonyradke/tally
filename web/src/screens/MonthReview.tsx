import { useState } from 'react'
import type { NavigateFunction } from 'react-router'
import type { Bootstrap } from '@/api/client'
import { budgetFor } from '@/lib/budgets'
import { formatCents } from '@/lib/money'
import { fromISO, monthOf } from '@/lib/dates'
import { categoryVisual } from '@/icons/categories'
import { Amount } from '@/components/Amount'
import { Mark } from '@/components/Mark'
import { Panel, Section } from '@/components/Panel'
import s from './MonthReview.module.css'

const KEY = 'tally.review_hidden'
const name = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'long' })
const whole = (c: number) => formatCents(c, { cents: false })

/** Last month at a glance, shown on Home for the first week of a month until hidden. */
export function MonthReview({ b, nav, force }: { b: Bootstrap; nav: NavigateFunction; force?: boolean }) {
  const [hidden, setHidden] = useState(() => localStorage.getItem(KEY))
  const i = b.months.findIndex((r) => r.month === monthOf(b.today))
  const m = b.months[i - 1], before = b.months[i - 2]
  if (!m || (!force && (fromISO(b.today).getDate() > 7 || hidden === m.month))) return null
  if (!m.money_in && !m.spent) return null

  const spending = b.categories.filter((c) => c.type === 'Spending')
  const moves = before ? spending
    .map((c) => ({ c, d: (m.by_category[String(c.id)] ?? 0) - (before.by_category[String(c.id)] ?? 0) }))
    .filter((x) => Math.abs(x.d) >= 500).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 3) : []
  const budgeted = spending.filter((c) => c.active).map((c) => ({ budget: budgetFor(b, c, m.month), spent: m.by_category[String(c.id)] ?? 0 })).filter((x) => x.budget)
  const within = budgeted.filter((x) => x.spent <= x.budget!).length
  const spentDiff = before ? m.spent - before.spent : 0
  const tiles = [
    { label: 'Money in', cents: m.money_in, tone: 'pos' as const },
    { label: 'Spent', cents: m.spent, tone: 'neutral' as const },
    { label: 'Saved', cents: m.saving, tone: 'neutral' as const },
    { label: before ? 'Net worth change' : 'Net worth', cents: before ? m.net_worth - before.net_worth : m.net_worth, tone: 'neutral' as const, change: !!before },
  ]
  const hide = () => { localStorage.setItem(KEY, m.month); setHidden(m.month) }

  return (
    <Section title={`${name(m.month)} in review`} action="Details" onAction={() => nav(`/insights?m=${m.month.slice(0, 7)}`)}>
      <Panel>
        <div className="label">Left over</div>
        <Amount cents={m.left_over} size="title" tone={m.left_over >= 0 ? 'pos' : 'neg'} roll />
        {before && <p className={`secondary tnum ${s.lede}`}>
          {Math.abs(spentDiff) < 1000 ? `You spent about the same as in ${name(before.month)}.`
            : `You spent ${whole(Math.abs(spentDiff))} ${spentDiff > 0 ? 'more' : 'less'} than in ${name(before.month)}.`}
        </p>}
        <div className={s.tiles}>
          {tiles.map((t) => (
            <div key={t.label} className={s.tile}>
              <span className="label">{t.label}</span>
              <Amount cents={t.cents} size="body" tone={t.change ? (t.cents >= 0 ? 'pos' : 'neg') : t.tone} sign={t.change ? 'always' : 'auto'} />
            </div>
          ))}
        </div>
        {moves.length > 0 && <ul className={s.moves}>
          {moves.map(({ c, d }) => { const v = categoryVisual(c)
            return (
              <li key={c.id} className={s.move}>
                <Mark Icon={v.Icon} color={v.color} size="sm" />
                <span className={s.moveName}>{c.name}</span>
                <span className={`tnum ${s.moveAmt}`}>{d > 0 ? 'Up' : 'Down'} {whole(Math.abs(d))}</span>
              </li>) })}
        </ul>}
        {budgeted.length > 0 && <p className={`secondary ${s.budgets}`}>
          {`Stayed within ${within} of ${budgeted.length} ${budgeted.length === 1 ? 'budget' : 'budgets'}.`}
        </p>}
        <button type="button" className={s.hide} onClick={hide}>Hide until next month</button>
      </Panel>
    </Section>
  )
}
