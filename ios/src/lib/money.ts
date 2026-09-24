// Cents in, strings out. The API never sees dollars except in request bodies (client.ts converts).

export type Sign = 'auto' | 'always' | 'never'

export function formatCents(c: number, { cents = true, sign = 'auto' }: { cents?: boolean; sign?: Sign } = {}): string {
  const abs = Math.abs(c)
  const body = (cents ? abs / 100 : Math.round(abs / 100)).toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })
  const s = sign === 'never' ? '' : c < 0 ? '−' : sign === 'always' && c > 0 ? '+' : ''
  return `${s}$${body}`
}

/** "12.5" → 1250, "$1,234.56" → 123456, "" → null. Half-up on the third decimal. */
export function parseDollars(s: string): number | null {
  const clean = s.replace(/[$,\s]/g, '').replace('−', '-')
  if (!clean || clean === '-' || clean === '.') return null
  const n = Number(clean)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100 + (n >= 0 ? 1e-9 : -1e-9))
}

/** Keypad-style digit string ("1234" = $12.34) → cents. */
export const digitsToCents = (digits: string): number => Number(digits || '0')

export const pct = (part: number, whole: number): number => (whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0)

/** Worklet-safe twin of formatCents (no Intl on the UI runtime): same output for en-US. */
export function formatCentsW(c: number, cents = true, sign: Sign = 'auto'): string {
  'worklet'
  const abs = Math.abs(c)
  const whole = cents ? Math.floor(abs / 100) : Math.round(abs / 100)
  let int = String(whole)
  let out = ''
  while (int.length > 3) { out = ',' + int.slice(-3) + out; int = int.slice(0, -3) }
  out = int + out
  if (cents) out += '.' + String(abs % 100).padStart(2, '0')
  const s = sign === 'never' ? '' : c < 0 ? '−' : sign === 'always' && c > 0 ? '+' : ''
  return `${s}$${out}`
}

/** Compact money for axes and chips: $1.4k, $12k, $1.2M. */
export function compactCents(c: number): string {
  const d = Math.abs(c) / 100
  const s = c < 0 ? '−' : ''
  if (d >= 1e6) return `${s}$${(d / 1e6).toFixed(d >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`
  if (d >= 1e3) return `${s}$${(d / 1e3).toFixed(d >= 1e4 ? 0 : 1).replace(/\.0$/, '')}k`
  return `${s}$${Math.round(d)}`
}
