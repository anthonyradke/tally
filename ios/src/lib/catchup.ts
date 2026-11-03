// Catching up one account at a time (app/catchup.tsx): the account stays put while entries go in one after another.
// The pure parts live here so the tests can run them.
import { merchantKey } from '@/icons/merchants'
import type { Account, CatType, Txn } from './api'
import { fromISO } from './dates'
import { SHAPES } from './shapes'

type Sides = { from_id: number | null; to_id: number | null }

export const touches = (x: Pick<Txn, 'from_id' | 'to_id'>, id: number) => x.from_id === id || x.to_id === id

/** The accounts a bank or card app has a list for: cash and cards still in use, in Settings' order. */
export const catchable = (accounts: Account[]) => accounts.filter((a) => a.active && (a.kind === 'cash' || a.kind === 'card'))

/** Where the account goes for a kind. `hint` is what's there already (a past entry being copied, or the draft): for a
 *  kind that can use both sides, money already coming into the account keeps coming in, and the other account stays. */
export function sides(kind: CatType, acct: number, hint: Sides = { from_id: null, to_id: null }): Sides {
  const s = SHAPES[kind]
  if (s.from === 'blank') return { from_id: null, to_id: acct }
  if (s.to === 'blank') return { from_id: acct, to_id: null }
  if (hint.to_id === acct && hint.from_id !== acct) return { from_id: hint.from_id, to_id: acct }
  const other = hint.from_id === acct ? hint.to_id : (hint.to_id ?? hint.from_id)
  return { from_id: acct, to_id: other === acct ? null : other }
}

/** Turns a transfer around: money into the account instead of out of it. */
export const flip = (d: Sides): Sides => ({ from_id: d.to_id, to_id: d.from_id })

/** The other account of a two-sided entry, and which side it's on. */
export const otherSide = (d: Sides, acct: number): { side: 'from' | 'to'; id: number | null } =>
  d.to_id === acct ? { side: 'from', id: d.from_id } : { side: 'to', id: d.to_id }

/** Past places for "What was it?", one row per place (the newest). With nothing typed, the places this account sees
 *  most; typing narrows to names starting with it, this account's first. */
export function suggest(history: Txn[], acct: number, text: string, n = 8): Txn[] {
  const want = merchantKey(text)
  const by = new Map<string, { row: Txn; count: number; mine: number }>()
  for (const x of history) { // newest first, so the first row seen for a place is its latest
    const k = merchantKey(x.what)
    if (!k || (want && !k.startsWith(want))) continue
    const mine = touches(x, acct)
    const cur = by.get(k)
    if (!cur) by.set(k, { row: x, count: 1, mine: mine ? 1 : 0 })
    else {
      cur.count++
      if (mine) { if (!cur.mine) cur.row = x; cur.mine++ } // copy how it went on this account, if it ever did
    }
  }
  return [...by.values()]
    .filter((v) => want || v.mine > 0)
    .sort((a, z) => z.mine - a.mine || z.count - a.count)
    .slice(0, n)
    .map((v) => v.row)
}

/** The categories this account uses most, most first. */
export function usualCategories(history: Txn[], acct: number, n = 6): number[] {
  const count = new Map<number, number>()
  for (const x of history) if (touches(x, acct)) count.set(x.category_id, (count.get(x.category_id) ?? 0) + 1)
  return [...count.entries()].sort((a, z) => z[1] - a[1]).slice(0, n).map(([id]) => id)
}

const daysApart = (a: string, b: string) => Math.abs(Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 864e5))

/** Entries on the account for the same amount within a few days: probably the one being typed, already in Tally
 *  (a payment entered from the other bank's side, a scheduled bill, last week's catch-up overlapping this one). */
export function lookalikes(rows: Txn[], line: { date: string; amount: number }, acct: number, days = 3): Txn[] {
  if (!line.amount) return []
  return rows.filter((x) => touches(x, acct) && x.amount === line.amount && daysApart(x.date, line.date) <= days)
}

