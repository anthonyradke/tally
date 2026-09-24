import { useMemo } from 'react'
import type { Bootstrap, Txn } from './api'
import { useTransactions } from './data'
import { fromISO, toISO } from './dates'

export interface Pace {
  /** Cumulative spending by day this month, day 1..today (index 0 = the 1st). */
  cur: number[]
  /** Cumulative spending by day last month, stretched/clamped to this month's length. */
  prev: number[]
  days: number
  /** Future-dated spending already on the books this month. */
  scheduled: number
  month: string
  prevMonth: string
}

const daysIn = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate()

/** The first and last day of the two months the pace compares: last month and this one. */
export function paceWindow(today: string): { start: string; end: string } {
  const t = fromISO(today)
  return { start: toISO(new Date(t.getFullYear(), t.getMonth() - 1, 1)), end: toISO(new Date(t.getFullYear(), t.getMonth() + 1, 0)) }
}

/** This month's spending day by day against last month's, from the spending rows in `paceWindow(today)`. */
export function paceFrom(items: Pick<Txn, 'date' | 'amount'>[], today: string): Pace {
  const t = fromISO(today)
  const { start } = paceWindow(today)
  const y = t.getFullYear(), m = t.getMonth()
  const days = daysIn(y, m), prevDays = daysIn(y, m - 1)
  const month = toISO(new Date(y, m, 1)), prevMonth = start
  const curDaily = new Array(days).fill(0), prevDaily = new Array(prevDays).fill(0)
  let scheduled = 0
  for (const x of items) {
    const d = fromISO(x.date)
    if (x.date > today) { if (x.date >= month) scheduled += x.amount; continue }
    if (x.date >= month) curDaily[d.getDate() - 1] += x.amount
    else prevDaily[d.getDate() - 1] += x.amount
  }
  const cum = (a: number[]) => { let n = 0; return a.map((v) => (n += v)) }
  const prevCum = cum(prevDaily)
  return {
    cur: cum(curDaily).slice(0, t.getDate()),
    prev: Array.from({ length: days }, (_, i) => prevCum[Math.min(i, prevDays - 1)]),
    days, scheduled, month, prevMonth,
  }
}

/** Spending pace for Home's month panel: this month so far against last month, day by day. */
export function usePace(b: Bootstrap | undefined): Pace | null {
  const today = b?.today ?? toISO(new Date())
  const { start, end } = paceWindow(today)
  const q = useTransactions({ type: 'Spending', start, end, limit: 2000 }, !!b)
  return useMemo(() => (q.data ? paceFrom(q.data.items, today) : null), [q.data, today])
}
