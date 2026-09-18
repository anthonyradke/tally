import type { CatType, Txn } from '@/api/client'
import type { Sign } from './money'
import type { Tone } from '@/components/Amount'

/** How a row's amount is presented. Statement convention: spending is plain, money in and refunds carry a sign. */
export function rowAmount(type: CatType, amount: number): { cents: number; sign: Sign; tone: Tone; muted: boolean } {
  if (type === 'Money in') return { cents: amount, sign: 'always', tone: amount >= 0 ? 'pos' : 'neg', muted: false }
  if (type === 'Spending') {
    return amount < 0
      ? { cents: -amount, sign: 'always', tone: 'pos', muted: false }
      : { cents: amount, sign: 'never', tone: 'neutral', muted: false }
  }
  return { cents: Math.abs(amount), sign: 'never', tone: 'neutral', muted: true }
}

export interface DayGroup { date: string; items: Txn[]; spent: number }

/** Items must already be sorted newest-first. */
export function groupByDay(items: Txn[], typeOf: (t: Txn) => CatType): DayGroup[] {
  const out: DayGroup[] = []
  for (const t of items) {
    let g = out[out.length - 1]
    if (!g || g.date !== t.date) { g = { date: t.date, items: [], spent: 0 }; out.push(g) }
    g.items.push(t)
    if (typeOf(t) === 'Spending') g.spent += t.amount
  }
  return out
}
