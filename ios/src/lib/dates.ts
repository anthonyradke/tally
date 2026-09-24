// ISO date strings (YYYY-MM-DD) everywhere; Date objects only at the formatting edge.

export const todayISO = (): string => toISO(new Date())

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export const monthOf = (iso: string): string => iso.slice(0, 7) + '-01'

/** The first day of the month before the one containing `iso`. */
export function monthBefore(iso: string): string {
  const d = fromISO(iso)
  return toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)) // toISOString() would be UTC: a day early east of it
}

export function monthLabel(iso: string, style: 'short' | 'long' = 'short'): string {
  return fromISO(iso).toLocaleDateString('en-US', { month: style, year: 'numeric' })
}

/** "Today", "Yesterday", "Tomorrow", else "Mon, Sep 14" (with year when it differs). */
export function dayLabel(iso: string, today: string = todayISO()): string {
  const diff = Math.round((fromISO(iso).getTime() - fromISO(today).getTime()) / 864e5)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  const d = fromISO(iso)
  const sameYear = d.getFullYear() === fromISO(today).getFullYear()
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

export const isFuture = (iso: string, today: string = todayISO()): boolean => iso > today
