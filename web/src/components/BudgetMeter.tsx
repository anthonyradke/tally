import { elapsed, paceOver } from '@/lib/budgets'
import { formatCents, pct } from '@/lib/money'
import { ProgressBar } from './ProgressBar'

/** A category's spending against its budget: the meter (notched at how much of the month has passed while the
 *  month is running), what's left or over, and a warning when the current pace ends the month over. */
export function BudgetMeter({ name, spent, budget, color, month, today }: { name: string; spent: number; budget: number; color: string; month: string; today: string }) {
  const over = spent > budget
  const f = elapsed(month, today)
  const ahead = paceOver(spent, budget, month, today)
  const whole = (c: number) => formatCents(c, { cents: false })
  return (
    <>
      <ProgressBar value={pct(spent, budget)} color={over ? 'var(--neg)' : color} label={`${name} budget`} mark={f < 1 ? f : undefined} />
      <span className={`secondary tnum ${over ? 'neg' : ''}`}>{over ? `${whole(spent - budget)} over` : `${whole(budget - spent)} left of ${whole(budget)}`}</span>
      {ahead !== null && <span className="secondary tnum neg">On pace to go {whole(ahead)} over</span>}
    </>
  )
}
