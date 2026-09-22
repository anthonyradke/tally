import type { Bootstrap, MonthRow } from '@/api/client'
import { monthOf } from './dates'

/** The month containing today, the one before it, and every month up to it. Not simply the last row: an entry
 *  dated next month (or a recurring template posting ahead) adds later months to `b.months`. */
export function monthsNow(b: Bootstrap): { cur: MonthRow; prev?: MonthRow; upTo: MonthRow[] } {
  let i = b.months.findIndex((m) => m.month === monthOf(b.today))
  if (i < 0) i = b.months.length - 1
  return { cur: b.months[i], prev: b.months[i - 1], upTo: b.months.slice(0, i + 1) }
}
