// Activity's list as the rows FlashList draws: day headers over panels of entries, the fold for scheduled entries,
// and, when a search typed an amount, the entries with that very amount first under their own heading.
import type { CatType, Txn } from './api'

export type Item =
  | { kind: 'sched'; key: string; count: number; cents: number; open: boolean }
  | { kind: 'label'; key: string; text: string }
  | { kind: 'head'; key: string; date: string; spent: number }
  | { kind: 'row'; key: string; t: Txn; first: boolean; last: boolean }

export interface FeedOptions {
  byAmount: boolean // sorted by amount: one panel, no day headers
  fold: boolean // newest first over all time: scheduled entries fold into one row at the top
  showSched: boolean // the fold is open
  exact: number // how many of the first rows have the amount a search typed
  today: string
  typeOf: (t: Txn) => CatType
}

export function feedItems(rows: Txn[], o: FeedOptions): Item[] {
  const split = o.exact > 0 && o.exact < rows.length
  if (split) {
    return [
      { kind: 'label', key: 'l-exact', text: 'Exact amount' }, ...part(rows.slice(0, o.exact), o, 'x'),
      { kind: 'label', key: 'l-more', text: 'More matches' }, ...part(rows.slice(o.exact), o, ''),
    ]
  }
  const out: Item[] = []
  const ahead = o.fold && !o.byAmount ? rows.filter((r) => r.date > o.today) : []
  if (ahead.length) {
    out.push({ kind: 'sched', key: 'sched', count: ahead.length, cents: ahead.reduce((n, x) => n + (o.typeOf(x) === 'Spending' ? x.amount : 0), 0), open: o.showSched })
  }
  return [...out, ...part(ahead.length && !o.showSched ? rows.slice(ahead.length) : rows, o, '')]
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
    if (first) out.push({ kind: 'head', key: `${pre}h${r.date}`, date: r.date, spent: spent.get(r.date) ?? 0 })
    out.push({ kind: 'row', key: `${pre}r${r.id}`, t: r, first, last: i === list.length - 1 || list[i + 1].date !== r.date })
  }
  return out
}

/** The selected rows' total, the way the list shows amounts: money in counts up, spending and refunds net out. */
export const selectedTotal = (rows: Txn[], typeOf: (t: Txn) => CatType) =>
  rows.reduce((n, r) => n + (typeOf(r) === 'Money in' ? -r.amount : r.amount), 0)

/** Which side a bulk account change works on: To when every row is money in, From when none is, either for a mix. */
export function accountSide(rows: Txn[], typeOf: (t: Txn) => CatType): 'from' | 'to' | 'either' {
  const ins = rows.filter((r) => typeOf(r) === 'Money in').length
  return ins === rows.length ? 'to' : ins === 0 ? 'from' : 'either'
}
