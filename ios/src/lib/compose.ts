// The new-entry composer's pure parts (app/new.tsx): what a quick action fills in, the places under "What was it?",
// and the words for the figure and the toast after Add.
import { merchantKey } from '@/icons/merchants'
import type { CatType, Favorite, Txn } from './api'
import { fromISO } from './dates'
import type { Draft } from './draft'
import { fromCents } from './draft'
import { formatCents } from './money'

/** The kind's name on the amount page's switch and under the figure on the review. */
export const KIND_NAME: Record<CatType, string> = { Spending: 'Spent', 'Money in': 'Income', Transfer: 'Transfer', Saving: 'Saving', Loan: 'Loan' }

type CatInfo = { type: CatType; name: string }

/** A quick action's label only names a place when it isn't just its category's name: a "Gas" chip under Gas would
 *  save every fill-up as "Gas", where the station belongs. */
export const namesPlace = (label: string, catName: string | undefined) => !!merchantKey(label) && merchantKey(label) !== merchantKey(catName ?? '')

/** What a quick action fills in. Its amount only when none has been typed yet (typing $4.50 and then tapping a $5.75
 *  Coffee chip kept $5.75); its label only when it names a place. */
export function quickFill(f: Favorite, cat: CatInfo | undefined, typed: boolean): Partial<Draft> {
  return {
    what: namesPlace(f.label, cat?.name) ? f.label : '', category_id: f.category_id, from_id: f.from_account_id, to_id: f.to_account_id,
    kind: cat?.type ?? 'Spending', ...(f.amount && !typed ? { amount: fromCents(f.amount), refund: f.amount < 0 } : {}),
  }
}

/** Past places for "What was it?", one row per place. Typing matches every kind (a "Transfer to savings" filed under
 *  Saving turns up under Transfer too), this kind's first, a name typed in full at the top. With nothing typed, it's
 *  this kind's recent places, the picked category's most used first (a Gas chip shows the stations first). */
export function places(history: Txn[], catOf: (x: Txn) => CatInfo, o: { text: string; kind: CatType; category: number | null }, n = 8): Txn[] {
  const want = merchantKey(o.text)
  const by = new Map<string, { row: Txn; count: number; at: number; exact: boolean }>()
  history.forEach((x, at) => { // newest first, so the first row seen for a place is its latest
    const k = merchantKey(x.what)
    if (!k || (want && !k.startsWith(want))) return
    const c = catOf(x)
    if (!want && c.type !== o.kind) return
    const cur = by.get(k)
    if (!cur) { by.set(k, { row: x, count: 1, at, exact: k === want }); return }
    cur.count++
    if (want && c.type === o.kind && catOf(cur.row).type !== o.kind) cur.row = x // how it went under this kind, if it ever did
  })
  const of = (v: { row: Txn }) => catOf(v.row)
  // Rows named after their own category (left by a chip like "Gas") aren't places to suggest first.
  const usual = (v: { row: Txn }) => !!o.category && v.row.category_id === o.category && merchantKey(of(v).name) !== merchantKey(v.row.what)
  const rank = want
    ? (v: { row: Txn; exact: boolean }) => (v.exact ? 0 : 2) + (of(v).type === o.kind ? 0 : 1)
    : (v: { row: Txn }) => (usual(v) ? 0 : 1)
  return [...by.values()]
    .sort((a, z) => rank(a) - rank(z) || (!want && usual(a) ? z.count - a.count : 0) || a.at - z.at)
    .slice(0, n)
    .map((v) => v.row)
}

/** A name typed in full that is one past place (case and punctuation aside): Return on it acts like tapping its row. */
export function exactPlace(history: Txn[], catOf: (x: Txn) => CatInfo, text: string, kind: CatType): Txn | undefined {
  const want = merchantKey(text)
  if (!want) return undefined
  const same = history.filter((x) => merchantKey(x.what) === want)
  return same.find((x) => catOf(x).type === kind) ?? same[0]
}

/** The figure as Activity will show it: money in and refunds green with a +, spending and transfers plain, and a
 *  correction (a negative entry of another kind) with a −. */
export function signed(cents: number, kind: CatType, refund: boolean): { text: string; pos: boolean } {
  const pos = refund ? kind === 'Spending' : kind === 'Money in'
  const sign = pos ? '+' : refund ? '−' : ''
  return { text: `${sign}${formatCents(Math.abs(cents))}`, pos }
}

/** Add's label: "Add $5.40", "Add refund $62.26". */
export const addLabel = (cents: number, kind: CatType, refund: boolean) =>
  `Add ${refund && kind === 'Spending' ? 'refund ' : ''}${formatCents(Math.abs(cents))}`

/** The day an entry went on, for the toast when it isn't today: "yesterday", "Sat Nov 14" ("Sat Nov 14 2025" in
 *  another year). Empty for today. */
export function dayNote(iso: string, today: string): string {
  if (iso === today) return ''
  const diff = Math.round((fromISO(iso).getTime() - fromISO(today).getTime()) / 864e5)
  if (diff === -1) return 'yesterday'
  if (diff === 1) return 'tomorrow'
  const d = fromISO(iso)
  const year = d.getFullYear() !== fromISO(today).getFullYear() ? ` ${d.getFullYear()}` : ''
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.toLocaleDateString('en-US', { month: 'short' })} ${d.getDate()}${year}`
}

/** The toast after Add: "Added $112.84 to Groceries", "Refunded $62.26 to Shopping", "Acme Corp, +$2,185.40 to
 *  Checking"; the day follows when it isn't today. */
export function addedText(o: { cents: number; kind: CatType; refund: boolean; what: string; category?: string; account?: string; date: string; today: string }): string {
  const day = dayNote(o.date, o.today)
  const amount = formatCents(o.cents)
  let s: string
  if (o.kind === 'Money in' && !o.refund) {
    const into = `+${amount}${o.account ? ` to ${o.account}` : ''}`
    s = o.what.trim() ? `${o.what.trim()}, ${into}` : `Added ${into}`
  } else {
    s = `${o.refund ? 'Refunded' : 'Added'} ${amount}${o.category ? ` to ${o.category}` : ''}`
  }
  return day ? `${s}, ${day}` : s
}
