// Which characters of a changing figure count as "the same" from one value to the next, so only the ones that really
// changed roll (SwiftUI's numeric text). Kept apart from the view so it can be tested.

const isDigit = (ch: string) => ch >= '0' && ch <= '9'

/** A key per character of `text`. Digits are keyed by their place among the digits only (from the left while
 *  typing, so each new digit appears at the end; from the right for a figure that changes, so a new leading digit
 *  doesn't disturb the rest), with the digit itself, so a changed digit swaps. "$" and the sign keep fixed keys;
 *  commas and the point are keyed by the digits around them. So "$123" → "$1,234" while typing only brings in the 4
 *  and the comma, "$999" → "$1,000" keeps the "$", and toggling a "−" in front moves nothing else. */
export function charKeys(text: string, typing = false): string[] {
  const chars = [...text]
  const total = chars.filter(isDigit).length
  let seen = 0
  return chars.map((ch) => {
    if (isDigit(ch)) { const k = typing ? seen : total - 1 - seen; seen++; return `d${k}:${ch}` }
    if (ch === '$') return 'cur'
    if (ch === '−' || ch === '-') return 'sign'
    if (ch === '+') return 'plus'
    return `${ch}${typing ? seen : total - seen}`
  })
}

/** The font size that fits `natural` (the width at `size`) into `room`, never below `min` of the original. */
export function fitSize(size: number, natural: number, room: number | undefined, min = 0.55): number {
  if (!room || room <= 0 || !natural || natural <= room) return size
  return Math.max(size * min, Math.floor(size * (room / natural) * 2) / 2)
}
