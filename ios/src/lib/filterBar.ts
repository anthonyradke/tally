// Activity's chip rows above the list, as chosen in Settings (`activity_filters`): which rows show, in what order, and
// which chips each row offers. Each row's first chip ("All", "Any account", …) lets go and is always there.
import type { Bootstrap, CatType } from './api'
import { addDays, lastOfMonth, monthBefore, monthOf } from './dates'
import type { Filters } from './filters'

export type BarRow = 'type' | 'account' | 'category' | 'when' | 'sort'
export const ROW_NAMES: Record<BarRow, string> = { type: 'Type', account: 'Accounts', category: 'Categories', when: 'Dates', sort: 'Sort' }
const ROWS: BarRow[] = ['type', 'account', 'when', 'category', 'sort']
/** Before anything is saved, Activity shows the two rows it always had. */
const ROWS_OFF: BarRow[] = ['when', 'category', 'sort']

export const TYPES: [CatType, string][] = [['Spending', 'Spending'], ['Money in', 'Money in'], ['Transfer', 'Transfers'], ['Saving', 'Saving'], ['Loan', 'Loans']]
export const SORTS: [string, string, Pick<Filters, 'sort' | 'dir'>][] = [
  ['newest', 'Newest', { sort: 'date', dir: 'desc' }], ['oldest', 'Oldest', { sort: 'date', dir: 'asc' }],
  ['largest', 'Largest', { sort: 'amount', dir: 'desc' }], ['smallest', 'Smallest', { sort: 'amount', dir: 'asc' }],
]
export type Range = 'all' | 'month' | 'last' | '90' | 'year' | 'upcoming'
/** The date ranges, worked out from today. Upcoming also sorts soonest first. */
export function ranges(today: string): [Range, string, Partial<Filters>][] {
  return [
    ['all', 'All time', { start: undefined, end: undefined }],
    ['month', 'This month', { start: monthOf(today), end: lastOfMonth(today) }], // not next month's scheduled entries
    ['last', 'Last month', { start: monthBefore(today), end: addDays(monthOf(today), -1) }],
    ['90', '90 days', { start: addDays(today, -90), end: undefined }],
    ['year', 'This year', { start: `${today.slice(0, 4)}-01-01`, end: undefined }],
    ['upcoming', 'Upcoming', { start: addDays(today, 1), end: undefined, sort: 'date', dir: 'asc' }],
  ]
}
export const activeRange = (f: Filters, today: string): Range | null =>
  ranges(today).find(([, , p]) => p.start === f.start && p.end === f.end)?.[0] ?? null

export interface Saved { order?: string[]; hidden?: string[]; chips?: Partial<Record<BarRow, { order?: string[]; hidden?: string[] }>> }
export function parseBar(raw: string | undefined): Saved {
  try { const v = JSON.parse(raw ?? '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}

/** A saved order over the current ids: gone ones drop out, new ones join at their default place. */
function ordered(all: string[], saved?: string[]): string[] {
  const out = (saved ?? []).filter((id, i, a) => all.includes(id) && a.indexOf(id) === i)
  all.forEach((id, i) => { if (!out.includes(id)) out.splice(i ? out.indexOf(all[i - 1]) + 1 : 0, 0, id) }) // right after its default neighbor
  return out
}

export interface Item { id: string; on: boolean }
export function barRows(s: Saved): Item[] {
  const hidden = new Set(s.order || s.hidden ? s.hidden ?? [] : ROWS_OFF)
  return ordered(ROWS, s.order).map((id) => ({ id, on: !hidden.has(id) }))
}

/** Whether a row's chips can be put in any order. Accounts and categories keep the order set for them in Settings. */
export const movable = (row: BarRow) => row === 'type' || row === 'when' || row === 'sort'

/** Every chip a row can offer (past its "any" chip), with its label. Hidden accounts and categories are left out. */
export function chipChoices(row: BarRow, b: Bootstrap): [string, string][] {
  switch (row) {
    case 'type': return TYPES.map(([t, l]) => [t, l])
    case 'account': return b.accounts.filter((a) => a.active).map((a) => [String(a.id), a.name])
    case 'category': return b.categories.filter((c) => c.active).map((c) => [String(c.id), c.name])
    case 'when': return ranges(b.today).filter(([k]) => k !== 'all').map(([k, l]) => [k, l])
    case 'sort': return SORTS.map(([k, l]) => [k, l])
  }
}

export function barChips(s: Saved, row: BarRow, b: Bootstrap): (Item & { label: string })[] {
  const all = chipChoices(row, b)
  const label = new Map(all)
  const ids = all.map(([id]) => id)
  const c = s.chips?.[row]
  const hidden = new Set(c?.hidden ?? [])
  return (movable(row) ? ordered(ids, c?.order) : ids).map((id) => ({ id, label: label.get(id)!, on: !hidden.has(id) }))
}

/** The rows and chips Activity shows. A chip turned off still shows while it's the one picked (from a link or a saved
 *  view), so a filter is never on with nothing lit. */
export function bar(b: Bootstrap, f: Filters): { row: BarRow; chips: { id: string; label: string }[] }[] {
  const s = parseBar(b.settings.activity_filters)
  const picked: Record<BarRow, string | undefined> = {
    type: f.type || undefined, account: f.account != null ? String(f.account) : undefined, category: f.category != null ? String(f.category) : undefined,
    when: activeRange(f, b.today) ?? undefined, sort: SORTS.find(([, , x]) => x.sort === f.sort && x.dir === f.dir)?.[0],
  }
  return barRows(s).filter((r) => r.on).map(({ id }) => {
    const row = id as BarRow
    const chips = barChips(s, row, b).filter((c) => c.on || c.id === picked[row])
    // A picked account or category that's hidden in Settings has no chip of its own: add it so it shows lit.
    const p = picked[row]
    if (p && (row === 'account' || row === 'category') && !chips.some((c) => c.id === p)) {
      const x = row === 'account' ? b.accounts.find((a) => String(a.id) === p) : b.categories.find((c) => String(c.id) === p)
      if (x) chips.push({ id: p, label: x.name, on: true })
    }
    return { row, chips: chips.map(({ id, label }) => ({ id, label })) }
  })
}

/** The setting after one change: a row or chip moved up one place, or switched on or off. */
export function moveRow(s: Saved, i: number): Saved {
  const rows = barRows(s)
  if (i <= 0 || i >= rows.length) return s
  const o = rows.map((r) => r.id); [o[i - 1], o[i]] = [o[i], o[i - 1]]
  return { ...s, order: o, hidden: rows.filter((r) => !r.on).map((r) => r.id) }
}
export function toggleRow(s: Saved, id: string, on: boolean): Saved {
  const rows = barRows(s)
  return { ...s, order: rows.map((r) => r.id), hidden: rows.filter((r) => (r.id === id ? !on : !r.on)).map((r) => r.id) }
}
export function moveChip(s: Saved, row: BarRow, b: Bootstrap, i: number): Saved {
  const chips = barChips(s, row, b)
  if (!movable(row) || i <= 0 || i >= chips.length) return s
  const o = chips.map((c) => c.id); [o[i - 1], o[i]] = [o[i], o[i - 1]]
  return { ...s, chips: { ...s.chips, [row]: { ...s.chips?.[row], order: o } } }
}
export function toggleChip(s: Saved, row: BarRow, id: string, on: boolean): Saved {
  const h = new Set(s.chips?.[row]?.hidden ?? [])
  if (on) h.delete(id); else h.add(id)
  return { ...s, chips: { ...s.chips, [row]: { ...s.chips?.[row], hidden: [...h] } } }
}
