// What the New design's screens read from the ledger: the bootstrap, lookups by id, today, and this month's row;
// whether there's anything true to show yet; and how an entry reads in one account's list.
import { useCallback } from 'react'
import { locked, unreachable, type Account, type Bootstrap, type CatType, type MonthRow, type Txn, type TxnPage } from '@/lib/api'
import { useBootstrap, type Lookups } from '@/lib/data'
import { dayLabel, monthOf, todayISO, toISO } from '@/lib/dates'
import { formatCents } from '@/lib/money'

// One set of lookups per bootstrap, shared by every screen and row (each row built its own Maps before).
const built = new WeakMap<Bootstrap, Lookups>()
const NONE: Lookups = { acct: new Map(), cat: new Map() }
export function lookupsFor(b: Bootstrap | undefined): Lookups {
  if (!b) return NONE
  let l = built.get(b)
  if (!l) {
    l = { acct: new Map(b.accounts.map((a) => [a.id, a])), cat: new Map(b.categories.map((c) => [c.id, c])) }
    built.set(b, l)
  }
  return l
}

export function useLedger() {
  const q = useBootstrap()
  const b = q.data
  const { acct, cat } = lookupsFor(b)
  const phone = todayISO()
  const today = b && b.today > phone ? b.today : phone
  const month = thisMonth(b, today)
  const typeOf = useCallback((t: Pick<Txn, 'category_id'>): CatType | undefined => cat.get(t.category_id)?.type, [cat])
  return { q, b, acct, cat, today, month, typeOf }
}

/** The month containing today, or nothing when the ledger has no row for it yet. Never the last month in the list:
 *  a scheduled entry adds later months, and a bootstrap kept from yesterday lacks a month begun today. */
export const thisMonth = (b: Pick<Bootstrap, 'months'> | undefined, today: string): MonthRow | undefined =>
  b?.months.find((m) => m.month === monthOf(today))

/** The months up to and including today's, for balances over time. */
export const pastMonths = (b: Pick<Bootstrap, 'months'> | undefined, today: string): MonthRow[] =>
  (b?.months ?? []).filter((m) => m.month <= monthOf(today))

/** The account an entry is "on", as a list shows it: where spending came from, where money in went. */
export const accountOf = (t: Pick<Txn, 'from_id' | 'to_id'>, type: CatType | undefined) =>
  type === 'Money in' ? t.to_id : t.from_id ?? t.to_id

export interface AmountLook { cents: number; plus: boolean; tone: 'pos' | 'plain' | 'quiet' }

/** How an entry reads in one account's list, like that account's statement: on cash and investments − for money
 *  out and a green + for money in; on cards and loans charges plain and payments or refunds as green + credits. */
export function signFrom(t: Pick<Txn, 'from_id' | 'to_id' | 'amount'>, a: Pick<Account, 'id' | 'kind'>): AmountLook {
  const flow = t.from_id === a.id ? -t.amount : t.to_id === a.id ? t.amount : 0
  if (flow > 0) return { cents: flow, plus: true, tone: 'pos' }
  return { cents: a.kind === 'card' || a.kind === 'loan' ? -flow : flow, plus: false, tone: 'plain' }
}

/** Whether a screen has something true to show. `note`: data kept on the phone is showing, but the last fetch failed
 *  (Tally unreachable, or the token refused). */
export type LoadKind = 'ready' | 'loading' | 'locked' | 'offline' | 'failed'
export function loadOf(q: { data?: unknown; error: unknown }): { kind: LoadKind; note: 'locked' | 'offline' | null } {
  if (q.data !== undefined) return { kind: 'ready', note: !q.error ? null : locked(q.error) ? 'locked' : 'offline' }
  if (!q.error) return { kind: 'loading', note: null }
  return { kind: locked(q.error) ? 'locked' : unreachable(q.error) ? 'offline' : 'failed', note: null }
}

/** "Updated 9:41 AM" today, else "Updated Yesterday" or "Updated Mon, Nov 3". */
export function updatedLabel(at: number, now = Date.now()): string {
  if (!at) return ''
  const d = new Date(at)
  const day = dayLabel(toISO(d), toISO(new Date(now)))
  return day === 'Today' ? `Updated ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : `Updated ${day}`
}

export type Filter = 'all' | 'Spending' | 'Money in' | 'Transfer'

/** The line over search results: how many, and what they add up to by type (a paycheck and a coffee don't sum). */
export function searchLine(page: Pick<TxnPage, 'total' | 'by_type'>, filter: Filter): string | null {
  if (!page.total) return null
  const n = page.total === 1 ? '1 result' : `${page.total} results`
  const by = page.by_type
  const spent = by.Spending ?? 0
  const earned = by['Money in'] ?? 0
  const moved = Math.abs(by.Transfer ?? 0) + Math.abs(by.Loan ?? 0) + Math.abs(by.Saving ?? 0)
  const f = (c: number) => formatCents(c, { cents: false })
  const parts = filter === 'Spending' ? [`${f(spent)} spent`]
    : filter === 'Money in' ? [`${f(earned)} in`]
      : filter === 'Transfer' ? [`${f(moved)} moved`]
        : [spent ? `${f(spent)} spent` : '', earned ? `${f(earned)} in` : '', !spent && !earned && moved ? `${f(moved)} moved` : '']
  return [n, ...parts.filter(Boolean)].join(' · ')
}

/** Rows grouped by day, in the order the days first appear, so a search's exact-amount matches listed first don't
 *  split a day in two. A row on two loaded pages (one added while paging) shows once. */
export function byDay<T extends Pick<Txn, 'id' | 'date' | 'amount'>>(rows: T[], spends: (t: T) => boolean): { date: string; spent: number; data: T[] }[] {
  const seen = new Set<number>()
  const days = new Map<string, { date: string; spent: number; data: T[] }>()
  for (const t of rows) {
    if (seen.has(t.id)) continue
    seen.add(t.id)
    let d = days.get(t.date)
    if (!d) { d = { date: t.date, spent: 0, data: [] }; days.set(t.date, d) }
    d.data.push(t)
    if (spends(t)) d.spent += t.amount
  }
  return [...days.values()]
}

/** How often you went to a place and what it came to, from a list of its entries (newest first) and the server's
 *  count and sums. A refund isn't a visit. When the server didn't filter by the exact name (an older server), only
 *  the exact matches loaded count. */
export function visits(page: Pick<TxnPage, 'total' | 'items' | 'by_type'> | undefined, name: string, type: CatType | undefined): { count: number; sum: number; rows: Txn[] } {
  if (!page) return { count: 0, sum: 0, rows: [] }
  const key = name.trim().toLowerCase()
  const rows = page.items.filter((x) => x.what.trim().toLowerCase() === key)
  const credits = rows.filter((x) => x.amount <= 0).length
  const all = rows.length === page.items.length
  const count = (all ? page.total : rows.length) - credits
  const loaded = rows.reduce((n, x) => n + x.amount, 0)
  const sum = all && type && page.by_type[type] !== undefined ? page.by_type[type]! : loaded
  return { count: Math.max(0, count), sum, rows }
}
