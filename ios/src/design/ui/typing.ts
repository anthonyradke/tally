// Typing an amount on the keypad, kept apart from the view so it can be tested.

export const DELETE = '⌫'

/** The typed amount after a key: digits and one point, two decimals at most, seven whole digits. null: refused.
 *  `replace`: the key starts a new amount instead of adding to this one (an amount being edited, shown selected):
 *  a digit or point starts over, delete clears it. */
export function typeKey(s: string, k: string, replace = false): string | null {
  if (replace) return k === DELETE ? '' : typeKey('', k)
  if (k === DELETE) return s.slice(0, -1)
  if (k === '.') return s.includes('.') ? null : (s || '0') + '.'
  const [whole, frac] = s.split('.')
  if (frac !== undefined && frac.length >= 2) return null
  if (frac === undefined && whole.length >= 7) return null
  if (s === '0') return k
  return s + k
}

/** What a key does to `value`: `next` null when it's refused; `changed` false when it does nothing (delete on an
 *  empty amount), so the pad neither ticks nor keeps repeating. */
export function keyEffect(value: string, k: string, replace = false): { next: string | null; changed: boolean } {
  const next = typeKey(value, k, replace)
  return { next, changed: next !== null && next !== value }
}

export const typedCents = (s: string) => Math.round(Number(s || '0') * 100)

/** "1234.5" -> "$1,234.5": what's typed so far, as money. */
export function typedText(s: string): string {
  const [whole, frac] = s.split('.')
  const w = Number(whole || '0').toLocaleString('en-US')
  return `$${w}${frac !== undefined ? '.' + frac : ''}`
}
