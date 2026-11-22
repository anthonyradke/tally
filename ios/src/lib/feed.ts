// Activity's list as the rows FlashList draws: day headers over panels of entries, the fold for scheduled entries,
// and, when a search typed an amount, the entries with that very amount first under their own heading. Also what
// select mode works on: only rows the list shows.
import type { Account, CatType, Txn } from './api'
import { effect } from './balances'
import type { Filters } from './filters'
import type { Sign } from './money'
import type { Tone } from './txn'

export type Item =
  | { kind: 'sched'; key: string; count: number; cents: number; open: boolean }
  | { kind: 'label'; key: string; text: string }
  | { kind: 'head'; key: string; date: string; spent: number; bal?: number }
  | { kind: 'row'; key: string; t: Txn; first: boolean; last: boolean }

export interface FeedOptions {
  byAmount: boolean // sorted by amount: one panel, no day headers
  fold: boolean // newest first over all time: scheduled entries fold into one row at the top
  showSched: boolean // the fold is open
  exact: number // how many of the first rows have the amount a search typed
  total?: number // every match, loaded or not (the rows given are the loaded ones)
  today: string
  typeOf: (t: Txn) => CatType
  closing?: Map<string, number> // one account's statement: its balance at the end of each day (`closingBalances`)
}

/** The exact matches get their own heading while some match isn't one, even when that one hasn't loaded yet. */
const isSplit = (rows: Txn[], o: FeedOptions) => o.exact > 0 && o.exact < (o.total ?? rows.length)

/** Whether the scheduled rows sit folded out of sight under the "N scheduled" row. */
export const hidesAhead = (rows: Txn[], o: FeedOptions) => o.fold && !o.byAmount && !o.showSched && !isSplit(rows, o)

export function feedItems(rows: Txn[], o: FeedOptions): Item[] {
  if (isSplit(rows, o)) {
    const rest = rows.slice(o.exact)
    return [
      { kind: 'label', key: 'l-exact', text: 'Exact amount' }, ...part(rows.slice(0, o.exact), o, 'x'),
      ...(rest.length ? [{ kind: 'label', key: 'l-more', text: 'More matches' } as Item, ...part(rest, o, '')] : []),
    ]
  }
  const out: Item[] = []
  const ahead = o.fold && !o.byAmount ? rows.filter((r) => r.date > o.today) : []
  if (ahead.length) {
    out.push({ kind: 'sched', key: 'sched', count: ahead.length, cents: ahead.reduce((n, x) => n + (o.typeOf(x) === 'Spending' ? x.amount : 0), 0), open: o.showSched })
  }
  return [...out, ...part(hidesAhead(rows, o) ? rows.filter((r) => r.date <= o.today) : rows, o, '')]
}

/** One run of rows: by day with a header each (its spending), or as one panel when sorted by amount. `pre` keeps
 *  keys apart when a day shows up in both parts of a split search. */
function part(list: Txn[], o: FeedOptions, pre: string): Item[] {
  if (o.byAmount) return list.map((r, i) => ({ kind: 'row', key: `${pre}r${r.id}`, t: r, first: i === 0, last: i === list.length - 1 }))
  const out: Item[] = []
  const spent = new Map<string, number>() // one pass: filtering every row for each day header was quadratic
  for (const x of list) if (o.typeOf(x) === 'Spending') spent.set(x.date, (spent.get(x.date) ?? 0) + x.amount)
  for (let i = 0; i < list.length; i++) {
    const r = list[i]
    const first = i === 0 || list[i - 1].date !== r.date
    if (first) out.push({ kind: 'head', key: `${pre}h${r.date}`, date: r.date, spent: spent.get(r.date) ?? 0, bal: o.closing?.get(r.date) })
    out.push({ kind: 'row', key: `${pre}r${r.id}`, t: r, first, last: i === list.length - 1 || list[i + 1].date !== r.date })
  }
  return out
}

/** How many entries Select all can take: every match the list shows, so not the scheduled ones folded out of sight.
 *  Newest first, those come before any posted row, so their count is known once a posted row has loaded or every
 *  page has; null until then. `shown`: the loaded rows the list draws. */
export function selectable(total: number, loaded: number, shown: number, more: boolean): number | null {
  const hidden = loaded - shown
  return hidden && !shown && more ? null : total - hidden
}

/** The picked entries select mode acts on: only ones the list shows (`shown`), or that Select all fetched for these
 *  same filters (`fetched`), less any of those folded out of sight (`hide`). An id that dropped out of view since,
 *  under a new search or a closed fold, is left out, so it can't be deleted or moved unseen. */
export function pickedRows(picked: Set<number>, shown: Txn[], fetched: Txn[], hide: boolean, today: string): Txn[] {
  const byId = new Map<number, Txn>()
  for (const r of fetched) if (!hide || r.date <= today) byId.set(r.id, r)
  for (const r of shown) byId.set(r.id, r) // the loaded copy is the fresher one
  const out: Txn[] = []
  for (const id of picked) { const r = byId.get(id); if (r) out.push(r) }
  return out
}

/** Whether a row counts toward the selection's total: spending and money in. Transfers, saving and loans move money
 *  between accounts and show muted in the list. */
export const counts = (type: CatType) => type === 'Spending' || type === 'Money in'

/** The selected rows' total, the way the list shows amounts: money in counts up, spending and refunds net out, the
 *  muted types are left out. */
export const selectedTotal = (rows: Txn[], typeOf: (t: Txn) => CatType) =>
  rows.reduce((n, r) => { const ty = typeOf(r); return n + (ty === 'Money in' ? -r.amount : ty === 'Spending' ? r.amount : 0) }, 0)

/** Which side a bulk account change works on: To when every row is money in, From when none is. For a mix, either:
 *  each row takes the side its type uses (To for money in, From for the rest), since no one side fits them all. */
export function accountSide(rows: Txn[], typeOf: (t: Txn) => CatType): 'from' | 'to' | 'either' {
  const ins = rows.filter((r) => typeOf(r) === 'Money in').length
  return ins === rows.length ? 'to' : ins === 0 ? 'from' : 'either'
}

/** The side of one row an account change sets, for `accountSide`'s answer. */
export const sideOf = (side: 'from' | 'to' | 'either', type: CatType): 'from' | 'to' =>
  side === 'either' ? (type === 'Money in' ? 'to' : 'from') : side

/** Activity reads as one account's statement when that account is the only filter (a date range aside) and the list
 *  is by date: each day header then carries the account's balance at the end of that day, to check against the bank. */
export const isStatement = (f: Filters) =>
  f.account != null && !f.q && !f.type && f.category == null && !f.tag && !f.group && f.sort === 'date'

/** A cash account's or a card's balance at the end of each day it has entries, by the engine's rules (as
 *  `balanceOn`: its starting balance plus every row from the ledger's start). `rows`: every entry, in any order. */
export function closingBalances(a: Account, rows: Txn[], start: string): Map<string, number> {
  const byDay = new Map<string, number>()
  for (const t of rows) if (t.date >= start && (t.from_id === a.id || t.to_id === a.id)) byDay.set(t.date, (byDay.get(t.date) ?? 0) + effect(a, t))
  const out = new Map<string, number>()
  let bal = a.start_balance
  for (const d of [...byDay.keys()].sort()) out.set(d, (bal += byDay.get(d)!))
  return out
}

/** A row's amount from one account's side (`here`, the account whose rows a list shows), the way its own statement
 *  puts it, so it can be followed line by line. A cash account: + for money into it, − for money out. A card or a
 *  loan: charges plain, as spending is everywhere, and payments and refunds onto it as green + credits. Otherwise
 *  green for money in and refunds, plain for spending, muted for transfers, saving and loans, as everywhere else.
 *  Undefined when the row moves nothing in or out of it. */
export function accountAmount(type: CatType, t: Pick<Txn, 'from_id' | 'to_id' | 'amount'>, here: Pick<Account, 'id' | 'kind'>): { cents: number; sign: Sign; tone: Tone; muted: boolean } | undefined {
  const v = (t.to_id === here.id ? t.amount : 0) - (t.from_id === here.id ? t.amount : 0)
  if (!v) return undefined
  const moved = type !== 'Spending' && type !== 'Money in'
  if (here.kind === 'card' || here.kind === 'loan') {
    return v > 0 ? { cents: v, sign: 'always', tone: 'pos', muted: false } : { cents: -v, sign: 'never', tone: 'neutral', muted: moved }
  }
  return { cents: v, sign: 'always', tone: moved ? 'neutral' : v > 0 ? 'pos' : type === 'Money in' ? 'neg' : 'neutral', muted: moved }
}
