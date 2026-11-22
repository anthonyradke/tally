import type { CatType, Freq, Txn } from './api'
import { fromCents, toCents, type Line } from './draft'
import type { Sign } from './money'

export type Tone = 'pos' | 'neg' | 'neutral'

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

export const FREQ_LABEL: Record<Freq, string> = { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', yearly: 'Yearly' }

/** A split whose first line takes whatever the other lines leave of the total (never below zero), so typing $40
 *  into line 2 of $120 reads $80 / $40 at once. Not once line 1 has been typed into itself (`typed`). */
export function balanceFirst(lines: Line[], total: number): Line[] {
  if (lines.length < 2 || lines[0].typed) return lines
  const left = Math.max(0, total - lines.slice(1).reduce((n, l) => n + toCents(l.amount), 0))
  const amount = left ? fromCents(left) : ''
  return lines[0].amount === amount ? lines : [{ ...lines[0], amount }, ...lines.slice(1)]
}

/** A split after an amount goes into line `key`: that line is marked typed, and line 1 rebalances unless it's the
 *  one typed into. */
export function putLine(lines: Line[], key: string, amount: string, total: number): Line[] {
  return balanceFirst(lines.map((l) => (l.key === key ? { ...l, amount, typed: true } : l)), total)
}

/** The first date after `today` on the same day of the month as `from` (the 31st falls back to a short month's
 *  last day), for a monthly template started from an entry. */
export function nextMonthly(from: string, today: string): string {
  const [y, m, d] = from.split('-').map(Number)
  for (let k = 1; ; k++) {
    const at = new Date(y, m - 1 + k, Math.min(d, new Date(y, m + k, 0).getDate()))
    const iso = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
    if (iso > today) return iso
  }
}

/** Tags as typed ("#Trip, work") → ["trip", "work"]. */
export const parseTags = (text: string): string[] => text.split(/[\s,]+/).map((x) => x.replace(/^#/, '').toLowerCase()).filter(Boolean)

/** The tag still being typed: the last word, unless the text ends in a space or comma. */
const typingTag = (text: string): string => (/[\s,]$/.test(text) ? '' : parseTags(text.split(/[\s,]+/).at(-1) ?? '')[0] ?? '')

/** Tags in use to offer while the entry's tags are edited: most used first, not already on the entry, and starting
 *  with the tag being typed. `used` comes most used first from bootstrap. */
export function tagSuggestions(used: { tag: string; count: number }[], text: string, max = 8): string[] {
  const word = typingTag(text)
  const have = new Set(parseTags(text))
  return used.map((x) => x.tag).filter((x) => x.startsWith(word) && !have.has(x)).slice(0, max)
}

/** The tags after tapping a suggestion: it takes the place of the tag being typed, or goes on the end. */
export function addTag(text: string, tag: string): string[] {
  const tags = parseTags(text)
  const kept = typingTag(text) ? tags.slice(0, -1) : tags
  return [...kept.filter((x) => x !== tag), tag]
}
