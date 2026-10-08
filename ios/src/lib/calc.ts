// Adding up on the keypad: type an amount, + or −, the next one, and so on; the big figure shows the running total
// and the line under it the sum so far ("12.50 + 4.25 −"). Next or Add takes the total.
import { formatCents } from './money'
import { toCents } from './draft'

export interface Calc { terms: { cents: number; sign: 1 | -1 }[]; sign: 1 | -1 }

export const total = (c: Calc | null, typed: string) =>
  (c ? c.terms.reduce((n, x) => n + x.sign * x.cents, 0) + c.sign * toCents(typed) : toCents(typed))

/** An operator pressed with `typed` on the keypad: the typed amount joins the sum and the next one starts. Pressing
 *  an operator again before typing just switches it. */
export function operate(c: Calc | null, typed: string, sign: 1 | -1): Calc {
  const cents = toCents(typed)
  if (!c) return { terms: cents ? [{ cents, sign: 1 }] : [], sign }
  return { terms: cents ? [...c.terms, { cents, sign: c.sign }] : c.terms, sign }
}

/** "12.50 + 4.25 −" for the line under the figure. */
export function expression(c: Calc, typed: string): string {
  const parts = c.terms.map((x, i) => `${i ? (x.sign > 0 ? '+ ' : '− ') : x.sign < 0 ? '− ' : ''}${formatCents(x.cents).slice(1)}`)
  const op = c.sign > 0 ? '+' : '−'
  return `${parts.join(' ')} ${op}${typed ? ` ${formatCents(toCents(typed)).slice(1)}` : ''}`.trim()
}
