import type { Bootstrap, Category, MonthRow } from '@/api/client'
import { fromISO, monthOf } from './dates'

/** A category's budget for a month: that month's override, else its default. */
export const budgetFor = (b: Bootstrap, c: Category, month: string): number | null =>
  b.budgets.find((x) => x.category_id === c.id && x.month === month)?.amount ?? c.budget

/** Share of `month` gone by `today`: 0..1, 1 for past months. */
export function elapsed(month: string, today: string): number {
  if (monthOf(today) > month) return 1
  if (monthOf(today) < month) return 0
  const t = fromISO(today)
  return t.getDate() / new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
}

/** How far over budget this month ends if spending keeps its pace so far, or null if it's on track. Quiet for the
 *  first five days (one grocery run isn't a pace) and once it's already over (the bar says that). */
export function paceOver(spent: number, budget: number, month: string, today: string): number | null {
  const f = elapsed(month, today)
  if (f >= 1 || fromISO(today).getDate() < 5 || spent > budget) return null
  const projected = Math.round(spent / f)
  return projected > budget * 1.05 ? projected - budget : null
}

export interface Suggestion { c: Category; average: number; suggested: number; months: number }

/** Suggested monthly budgets: the average of up to the last three completed months, rounded up to the next $10.
 *  Only active spending categories with some spending in those months. */
export function suggestBudgets(b: Bootstrap): Suggestion[] {
  const done: MonthRow[] = b.months.filter((m) => m.month < monthOf(b.today)).slice(-3)
  if (!done.length) return []
  return b.categories.filter((c) => c.active && c.type === 'Spending').map((c) => {
    const average = Math.round(done.reduce((n, m) => n + (m.by_category[String(c.id)] ?? 0), 0) / done.length)
    return { c, average, suggested: Math.ceil(average / 1000) * 1000, months: done.length }
  }).filter((x) => x.average > 0).sort((x, y) => y.average - x.average)
}
