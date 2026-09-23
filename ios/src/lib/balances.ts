// Day-by-day balances for cash accounts and cards, using the engine's rules (verified cent-exact against the
// month-end balances the server computes): cash = start + To rows − From rows; card = start + From rows − To rows.
// Investments and loans are typed/accrued monthly, so they only have month-end points.
import { useMemo } from 'react'
import type { Account, Bootstrap, Txn } from './api'
import { useTransactions } from './data'
import { addDays } from './dates'

/** Every row, oldest first reused by Accounts and account detail (one cached request). */
export const useAllTxns = (enabled = true) => useTransactions({ limit: 10000, sort: 'date', dir: 'asc' }, enabled)

export interface Series { dates: string[]; values: number[] }

export function dailyBalances(a: Account, rows: Txn[], start: string, end: string): Series {
  const s = a.kind === 'card' ? -1 : 1
  const byDay = new Map<string, number>()
  for (const t of rows) {
    if (t.date < start || t.date > end) continue
    let v = 0
    if (t.to_id === a.id) v += s * t.amount
    if (t.from_id === a.id) v -= s * t.amount
    if (v) byDay.set(t.date, (byDay.get(t.date) ?? 0) + v)
  }
  const dates: string[] = [], values: number[] = []
  let bal = a.start_balance
  for (let d = start; d <= end; d = addDays(d, 1)) {
    bal += byDay.get(d) ?? 0
    dates.push(d); values.push(bal)
  }
  return { dates, values }
}

/** Balance as of today (future-dated rows left out), for every account. */
export function useBalancesToday(b: Bootstrap | undefined) {
  const q = useAllTxns(!!b)
  return useMemo(() => {
    const out = new Map<number, number>()
    if (!b) return out
    const last = b.months.filter((m) => m.month <= b.today).at(-1)
    for (const a of b.accounts) {
      if ((a.kind === 'cash' || a.kind === 'card') && q.data) {
        out.set(a.id, dailyBalances(a, q.data.items, b.start, b.today).values.at(-1) ?? a.start_balance)
      } else {
        out.set(a.id, last?.balances[String(a.id)] ?? a.start_balance)
      }
    }
    return out
  }, [b, q.data])
}

/** Net worth pieces from a set of balances. Cards and loans are owed (positive = debt). */
export function split(b: Bootstrap, bal: Map<number, number>) {
  let assets = 0, debts = 0
  for (const a of b.accounts) {
    const v = bal.get(a.id) ?? 0
    if (a.kind === 'card' || a.kind === 'loan') debts += v
    else assets += v
  }
  return { assets, debts, net: assets - debts }
}
