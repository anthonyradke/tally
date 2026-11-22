import type { Bootstrap, MonthRow } from '@/lib/api'
import { monthOf } from './dates'

/** The month containing today, the one before it, and every month up to it. Not simply the last row: an entry
 *  dated next month (or a recurring template posting ahead) adds later months to `b.months`. */
export function monthsNow(b: Bootstrap): { cur: MonthRow; prev?: MonthRow; upTo: MonthRow[] } {
  let i = b.months.findIndex((m) => m.month === monthOf(b.today))
  if (i < 0) i = b.months.length - 1
  return { cur: b.months[i], prev: b.months[i - 1], upTo: b.months.slice(0, i + 1) }
}

/** A `month` link parameter (YYYY-MM) as the ledger month it names, up to this month; null for anything else. A month
 *  outside the ledger (or 2026-13) showed one month's figure over another month's places and entries. */
export function ledgerMonth(b: Bootstrap, asked: string | undefined): string | null {
  if (!asked || !/^\d{4}-(0[1-9]|1[0-2])$/.test(asked)) return null
  const m = `${asked}-01`
  return m <= monthOf(b.today) && b.months.some((r) => r.month === m) ? m : null
}
