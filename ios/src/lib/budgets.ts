import type { Bootstrap, Category, MonthRow, Txn } from '@/lib/api'
import { merchantKey } from '@/icons/merchants'
import { fromISO, lastOfMonth, monthOf } from './dates'
import { formatCents } from './money'

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

/** How far over budget this month ends if the rest of it goes like the months before: what's spent so far plus what
 *  those months usually spent after this day (`usual`, from typical.ts). Null when it's on track, with no history to
 *  go by, for the first five days (one grocery run isn't a pace) and once it's already over (the bar says that).
 *  It used to project straight-line, so rent paid on the 1st read "on pace to go $7,000 over" on the 5th. */
export function paceOver(spent: number, budget: number, month: string, today: string, usual?: { by: number; full: number } | null): number | null {
  const f = elapsed(month, today)
  if (!usual || f >= 1 || f <= 0 || fromISO(today).getDate() < 5 || spent > budget) return null
  const projected = spent + Math.max(0, usual.full - usual.by)
  return projected > budget * 1.05 ? projected - budget : null
}

/** How many months before a month its usual averages over. Trends and the category page use the same ones, so a card
 *  reading +40% doesn't open a page saying "18% higher". */
export const USUAL_MONTHS = 5

/** The average of the (up to `USUAL_MONTHS`) values before index `k`, or null with none before it. */
export function usualBefore(values: number[], k: number): number | null {
  const before = values.slice(Math.max(0, k - USUAL_MONTHS), k)
  return before.length ? before.reduce((n, v) => n + v, 0) / before.length : null
}

/** A month against its usual as a share (0.4 = 40% higher), or null with nothing usual to go by. Within 5% either way
 *  is "about the same": Trends shows no figure and the category page says so. */
export function vsUsual(now: number, usual: number | null): number | null {
  if (usual == null || usual <= 0) return null
  const change = (now - usual) / usual
  return Math.abs(change) < 0.05 ? 0 : change
}

/** A category's entry in a `Typical`, as `paceOver` takes it. */
export const usualFor = (t: { by: Map<number, number>; full: Map<number, number> } | null, id: number) =>
  t && t.full.has(id) ? { by: t.by.get(id) ?? 0, full: t.full.get(id)! } : null

/** Every budgeted spending category in a month taken together: their budgets summed, and what those categories spent.
 *  Null with no budgets set. Unbudgeted categories stay out, so "under budget" means what the budgets cover. */
export function monthBudget(b: Bootstrap, m: MonthRow): { budget: number; spent: number; ids: number[] } | null {
  let budget = 0, spent = 0
  const ids: number[] = []
  for (const x of b.categories) {
    if (x.type !== 'Spending' || !x.active) continue
    const cap = budgetFor(b, x, m.month)
    if (!cap) continue
    budget += cap
    spent += m.by_category[String(x.id)] ?? 0
    ids.push(x.id)
  }
  return budget > 0 ? { budget, spent, ids } : null
}

/** The month's total budget as a guide line on a chart of all its spending, or null when some of that spending is in
 *  categories without a budget: the line would cross the guide while `budgetLine` (budgeted categories only) still
 *  said there was money left. */
export function budgetGuide(b: Bootstrap, m: MonthRow): number | null {
  const t = monthBudget(b, m)
  if (!t) return null
  const covered = new Set(t.ids.map(String))
  const types = new Map(b.categories.map((c) => [String(c.id), c.type]))
  const outside = Object.entries(m.by_category).some(([id, v]) => v !== 0 && types.get(id) === 'Spending' && !covered.has(id))
  return outside ? null : t.budget
}

/** One sentence on how a month stands against its total budget, with the same pace rule as a category's bar. A month
 *  still going says what's left and for how long, or how far over it's headed; a finished month only speaks up when it
 *  went over (the under-budget badge covers the rest). Null with no budgets, or for a month not started. */
export function budgetLine(b: Bootstrap, m: MonthRow, typical: { by: Map<number, number>; full: Map<number, number> } | null):
  { text: string; tone: 'neg' | 'warn' | 'label2' } | null {
  const t = monthBudget(b, m)
  const now = monthOf(b.today)
  if (!t || now < m.month) return null
  const cap = formatCents(t.budget, { cents: false })
  const over = formatCents(t.spent - t.budget, { cents: false })
  if (now > m.month) return t.spent > t.budget ? { text: `Finished ${over} over its ${cap} budget`, tone: 'neg' } : null
  const left = Number(lastOfMonth(m.month).slice(8)) - Number(b.today.slice(8))
  const days = left === 0 ? 'today' : left === 1 ? 'for 1 more day' : `for ${left} more days`
  if (t.spent > t.budget) return { text: `${over} over your ${cap} budget`, tone: 'neg' }
  // The month's usual is every budgeted category's usual added up.
  const parts = t.ids.map((id) => usualFor(typical, id)).filter((u) => u != null)
  const usual = parts.length ? { by: parts.reduce((n, u) => n + u.by, 0), full: parts.reduce((n, u) => n + u.full, 0) } : null
  const warn = paceOver(t.spent, t.budget, m.month, b.today, usual)
  if (warn != null) return { text: `On pace to go ${formatCents(warn, { cents: false })} over your ${cap} budget`, tone: 'warn' }
  return { text: `${formatCents(t.budget - t.spent, { cents: false })} of your ${cap} budget left ${days}`, tone: 'label2' }
}

/** A budgeted category that's a fixed bill (it has a recurring template) and has taken its whole budget, give or take
 *  a dollar: rent reads "Paid", not "$0 left" over a full bar. */
export function paidBill(b: Bootstrap, id: number, spent: number, budget: number): boolean {
  return spent > 0 && Math.abs(budget - spent) <= 100 && b.recurring.some((r) => r.category_id === id && !!r.active)
}

/** Whether a row is a bill: posted by a recurring template, or the same place and category as one (rent typed in by
 *  hand before its template existed). Story highlights and the day-by-day shading leave bills out. */
export function billTest(b: Bootstrap): (t: Pick<Txn, 'recurring_id' | 'category_id' | 'what'>) => boolean {
  const known = new Set(b.recurring.filter((r) => r.active).map((r) => `${r.category_id}|${merchantKey(r.what || r.label)}`))
  return (t) => !!t.recurring_id || known.has(`${t.category_id}|${merchantKey(t.what)}`)
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
