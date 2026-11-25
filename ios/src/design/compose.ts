// The composer's rules that the screen doesn't need to hold: which categories and accounts each kind of entry offers,
// when it's ready to save, and how a loaded amount reads on the keypad. Entry rules (CLAUDE.md): Money in = To only,
// Spending = From only, Transfer = both, Saving and Loan = From with To optional.
import type { Account, CatType, Category, Kind, Txn } from '@/lib/api'

export type Mode = 'out' | 'in' | 'move'
export const TYPES: Record<Mode, CatType[]> = { out: ['Spending'], in: ['Money in'], move: ['Transfer', 'Loan', 'Saving'] }
export const modeOf = (t: CatType | undefined): Mode => (t === 'Money in' ? 'in' : t === 'Spending' || !t ? 'out' : 'move')

const EVERYDAY: Kind[] = ['cash', 'card', 'investment'] // an HSA is an investment account and still pays for things

/** The account kinds that can be From: none for money in; cash, cards and investments otherwise. */
export function fromKinds(mode: Mode): Kind[] {
  return mode === 'in' ? [] : EVERYDAY
}

/** The account kinds that can be To, by what the category is: a loan payment goes to a loan, saving to an
 *  investment or savings account, a card payment to a card. Before a category is chosen a move offers every kind. */
export function toKinds(mode: Mode, c?: Pick<Category, 'name' | 'type'>): Kind[] {
  if (mode === 'out') return []
  if (mode === 'in') return EVERYDAY
  if (!c) return [...EVERYDAY, 'loan']
  if (c.type === 'Loan') return ['loan']
  if (c.type === 'Saving') return ['investment', 'cash']
  if (/card/i.test(c.name)) return ['card']
  return EVERYDAY
}

/** Whether To must be filled: money in and transfers; saving and loan payments may leave it blank. */
export const needsTo = (mode: Mode, type: CatType | undefined) => mode === 'in' || (mode === 'move' && type === 'Transfer')

/** Accounts to offer, in the order of `kinds` (cash before cards before investments). Hidden accounts and other kinds
 *  are left out, except `keep`, the one already chosen, so an edit never shows a blank picker. */
export function accountChoices(accounts: Account[], kinds: Kind[], keep: number | null, skip?: number | null): Account[] {
  return accounts
    .filter((a) => a.id !== skip && (a.id === keep || (a.active && kinds.includes(a.kind))))
    .map((a, i) => ({ a, i, k: kinds.includes(a.kind) ? kinds.indexOf(a.kind) : kinds.length }))
    .sort((x, y) => x.k - y.k || x.i - y.i)
    .map((x) => x.a)
}

/** Categories of these types, hidden ones left out except `keep`. */
export function categoryChoices(categories: Category[], types: CatType[], keep: number | null): Category[] {
  return categories.filter((c) => c.id === keep || (c.active && types.includes(c.type)))
}

/** Whether `id` is still a fair pick among `choices` (a remembered account can since have been hidden). */
export const offered = (choices: { id: number }[], id: number | null | undefined): id is number =>
  id != null && choices.some((x) => x.id === id)

/** The amount an entry loads with, as the keypad would have typed it: $45 is "45", $12.50 is "12.50". */
export function loadedAmount(cents: number): string {
  const c = Math.abs(cents)
  return c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2)
}

/** What a key types onto: a loaded amount is replaced by the first digit (or point), the way 3.7.0 did; delete
 *  still edits it. */
export const typedBase = (s: string, k: string, fresh: boolean) => (fresh && k !== '⌫' ? '' : s)

/** Whether the form has what the entry's type needs. */
export function ready(f: { mode: Mode; cents: number; cat: number | null; type: CatType | undefined; from: number | null; to: number | null }): boolean {
  if (f.cents <= 0 || f.cat === null) return false
  if (f.mode === 'out') return f.from !== null
  if (f.mode === 'in') return f.to !== null
  if (f.from === null || f.from === f.to) return false
  return !needsTo(f.mode, f.type) || f.to !== null
}

/** The entry as saved: Money in fills To only, Spending From only, a move From and To (To may be blank). `neg`
 *  keeps a negative amount negative (a refund, or a Money in or Transfer correction loaded for editing). */
export function entryOf(f: { mode: Mode; cents: number; neg: boolean; from: number | null; to: number | null }) {
  return {
    amount: f.neg ? -f.cents : f.cents,
    from_id: f.mode === 'in' ? null : f.from,
    to_id: f.mode === 'out' ? null : f.to,
  }
}

/** The fields an edit's Undo puts back. Split group stays out: edits only change what they send. */
export const undoInput = (t: Txn) => ({ date: t.date, what: t.what, category_id: t.category_id, amount: t.amount, from_id: t.from_id, to_id: t.to_id, note: t.note, tags: t.tags })

/** The confirmation after adding: "Added Costco", or "Added Costco Refund". */
export const addedText = (name: string, refund: boolean) => `Added ${name}${refund ? ' Refund' : ''}`
