// Catching up one account at a time (app/catchup.tsx): the account stays put while entries go in one after another.
// The pure parts live here so the tests can run them.
import { merchantKey } from '@/icons/merchants'
import type { Account, CatType, Txn } from './api'
import { balanceOn, effect } from './balances'
import { dayLabel, fromISO } from './dates'
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

/** The direction to start a category in, when it's picked on its own (a chip or the full list) rather than copied
 *  from a past entry: how the latest entry with that category on this account went, else a lean from the account. A
 *  transfer on a card or a loan, or a loan payment on a loan, is nearly always a payment onto it, so money comes in
 *  (a loan payment on a card is the card paying a loan: money out). Anything else keeps `fallback` (the draft). */
export function hintFor(history: Txn[], acct: Pick<Account, 'id' | 'kind'>, categoryId: number, kind: CatType, fallback: Sides): Sides {
  const past = history.find((x) => x.category_id === categoryId && touches(x, acct.id)) // newest first
  if (past) return { from_id: past.from_id, to_id: past.to_id }
  const onto = (acct.kind === 'card' && kind === 'Transfer') || (acct.kind === 'loan' && (kind === 'Transfer' || kind === 'Loan'))
  if (onto) return { from_id: null, to_id: acct.id }
  return fallback
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

/** The place typed, when it's exactly one of the suggestions (same merchant): Return then copies it as a tap would. */
export function exactPlace(history: Txn[], acct: number, text: string): Txn | null {
  const want = merchantKey(text)
  if (!want) return null
  return suggest(history, acct, text).find((x) => merchantKey(x.what) === want) ?? null
}

/** The category chips for an account: the ones it uses, most recently used first, then (with `spending`, which says
 *  whether a category is Spending) the most used Spending categories anywhere, so a checking account whose own
 *  entries are all transfers still offers everyday ones. */
export function usualCategories(history: Txn[], acct: number, n = 6, spending?: (id: number) => boolean, total = 8): number[] {
  const own: number[] = []
  const count = new Map<number, number>()
  for (const x of history) { // newest first
    if (touches(x, acct)) { if (!own.includes(x.category_id)) own.push(x.category_id) }
    if (spending?.(x.category_id)) count.set(x.category_id, (count.get(x.category_id) ?? 0) + 1)
  }
  if (!spending) return own.slice(0, n)
  const mine = own.slice(0, Math.min(n, total - 3)) // room for a few everyday ones
  const rest = [...count.entries()].filter(([id]) => !mine.includes(id)).sort((a, z) => z[1] - a[1]).map(([id]) => id)
  return [...mine, ...rest].slice(0, total)
}

/** The account's balance after each row, the way a bank's list shows a running balance: day by day, and in the order
 *  they were entered within a day. `rows` in any order; rows before `start` don't count, as in the engine. */
export function runningBalances(acct: Account, rows: Txn[], start: string): Map<number, number> {
  const mine = rows.filter((x) => touches(x, acct.id) && x.date >= start)
    .sort((a, z) => (a.date < z.date ? -1 : a.date > z.date ? 1 : a.id - z.id))
  const out = new Map<number, number>()
  let bal = acct.start_balance
  for (const x of mine) { bal += effect(acct, x); out.set(x.id, bal) }
  return out
}

/** A cash account's or a card's balance once `line` is in, on its day, to check against the bank's running balance.
 *  Before a category says which way it goes (`sided` false), it counts as money out. Null for other kinds. */
export function balanceAfter(acct: Account, rows: Txn[], start: string, line: Pick<Txn, 'date' | 'from_id' | 'to_id' | 'amount'>, sided: boolean): number | null {
  if (acct.kind !== 'cash' && acct.kind !== 'card') return null
  const way = sided ? line : { from_id: acct.id, to_id: null, amount: line.amount }
  return balanceOn(acct, rows, start, line.date) + (line.amount ? effect(acct, way) : 0)
}

/** A day for the middle of a sentence: "through today", "since yesterday", "through Fri, Nov 20". */
export const midSentence = (iso: string, today: string): string => {
  const s = dayLabel(iso, today)
  return /^(Today|Yesterday|Tomorrow)$/.test(s) ? s.toLowerCase() : s
}

const daysApart = (a: string, b: string) => Math.abs(Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 864e5))

/** Entries on the account for the same amount within a few days: probably the one being typed, already in Tally
 *  (a payment entered from the other bank's side, a scheduled bill, last week's catch-up overlapping this one). */
export function lookalikes(rows: Txn[], line: { date: string; amount: number }, acct: number, days = 3): Txn[] {
  if (!line.amount) return []
  return rows.filter((x) => touches(x, acct) && x.amount === line.amount && daysApart(x.date, line.date) <= days)
}

/** The lookalike to point out for the line being added, if any (`skip`: rows this session added or took back).
 *  While the figure is only a suggestion copied from a past entry, a matching amount is no evidence (it was copied),
 *  so only that same place on the same day counts: a fixed-price coffee bought every other day isn't a duplicate. */
export function duplicateOf(rows: Txn[], line: { date: string; amount: number; what: string }, acct: number,
  skip: (id: number) => boolean, suggested = false): Txn | null {
  const hits = lookalikes(rows, line, acct).filter((x) => !skip(x.id))
  const want = merchantKey(line.what)
  return (suggested ? hits.filter((x) => x.date === line.date && merchantKey(x.what) === want) : hits)[0] ?? null
}

/** A row a catch-up added, with the full list's `dataUpdateCount` after which that list must have it: a list already
 *  on its way when the row was added may not. */
export type Added = Txn & { by: number }

/** The rows with this session's in them, before the full list (`items`, at data version `version`) refreshes, and the
 *  session's rows as they are now (`live`, current versions). A session row missing from a list fetched after it was
 *  added was deleted elsewhere (a swipe in the session list, the editor). `gone`: rows the session took back itself
 *  (Undo), left out even while a list fetched before the Undo still has them. */
export function sessionRows(added: Added[], items: Txn[] | undefined, version: number, gone: ReadonlySet<number>): { rows: Txn[] | null; live: Txn[] } {
  const kept = added.filter((x) => !gone.has(x.id))
  if (!items) return { rows: null, live: kept }
  const base = gone.size ? items.filter((x) => !gone.has(x.id)) : items
  const byId = new Map(base.map((x) => [x.id, x]))
  const live = kept.filter((x) => byId.has(x.id) || version <= x.by).map((x) => byId.get(x.id) ?? x)
  return { rows: [...base, ...live.filter((x) => !byId.has(x.id))], live }
}

