// Activity's chip rows above the list, as chosen in Settings (`activity_filters`): which rows show, in what order, and
// which chips each row offers. Each row's first chip ("All", "Any account", …) lets go and is always there.
import type { Bootstrap, CatType } from './api'
import { addDays, dayLabel, fromISO, lastOfMonth, monthBefore, monthOf } from './dates'
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
    ['90', '90 days', { start: addDays(today, -90), end: today }], // what happened: not the bills scheduled ahead
    ['year', 'This year', { start: `${today.slice(0, 4)}-01-01`, end: `${today.slice(0, 4)}-12-31` }],
    ['upcoming', 'Upcoming', { start: addDays(today, 1), end: undefined, sort: 'date', dir: 'asc' }],
  ]
}
export const activeRange = (f: Pick<Filters, 'start' | 'end'>, today: string): Range | null =>
  ranges(today).find(([, , p]) => p.start === f.start && p.end === f.end)?.[0] ?? null

/** Home's Coming up and Next 30 days: what a link from there shows, so the totals agree. */
export const next30 = (today: string): Partial<Filters> => ({ start: addDays(today, 1), end: addDays(today, 30), sort: 'date', dir: 'asc' })

/** A date range a saved view keeps by name and works out again from the day it goes on: a chip's range, or Home's
 *  Next 30 days (which has no chip). */
export function namedRange(f: Pick<Filters, 'start' | 'end'>, today: string): string | null {
  const n = next30(today)
  return activeRange(f, today) ?? (f.start === n.start && f.end === n.end ? 'next30' : null)
}
/** The dates a range's name stands for today, or undefined for a name it doesn't know. */
export function rangeDates(name: string | null, today: string): Pick<Filters, 'start' | 'end'> | undefined {
  const p = name === 'next30' ? next30(today) : ranges(today).find(([k]) => k === name)?.[2]
  return p && { start: p.start, end: p.end }
}

/** Only scheduled entries: the list says "Scheduled" and "due", not "Spent". */
export const isAhead = (f: Pick<Filters, 'start'>, today: string) => !!f.start && f.start > today

const short = (iso: string, today: string) =>
  fromISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(iso.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }) })

/** The date filter in words: a range's name, a month ("October"), a day ("Yesterday"), or its ends. */
export function rangeLabel(f: Pick<Filters, 'start' | 'end'>, today: string): string | null {
  const { start, end } = f
  if (!start && !end) return null
  const named = ranges(today).find(([, , p]) => p.start === start && p.end === end)
  if (named) return named[1]
  if (start === addDays(today, 1) && end === addDays(today, 30)) return 'Next 30 days'
  if (start && end) {
    if (start === end) return dayLabel(start, today)
    if (start === monthOf(start) && end === lastOfMonth(start)) {
      return fromISO(start).toLocaleDateString('en-US', { month: 'long', ...(start.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }) })
    }
    return `${short(start, today)} to ${short(end, today)}`
  }
  return start ? `From ${short(start, today)}` : `Until ${short(end!, today)}`
}

export interface Pill { key: string; label: string; clear: Partial<Filters> }
/** The filters that are on with nothing lit for them in the chip rows above the list (their row is switched off,
 *  or a date range no chip stands for), as pills to take them off one at a time. */
export function pills(b: Bootstrap, f: Filters): Pill[] {
  const shown = new Set(bar(b, f).filter((r) => r.chips.length > 0).map((r) => r.row))
  const out: Pill[] = []
  if (f.type && !shown.has('type')) out.push({ key: 'type', label: TYPES.find(([t]) => t === f.type)?.[1] ?? f.type, clear: { type: '' } })
  const a = f.account != null && !shown.has('account') ? b.accounts.find((x) => x.id === f.account) : undefined
  if (a) out.push({ key: 'account', label: a.name, clear: { account: undefined } })
  const c = f.category != null && !shown.has('category') ? b.categories.find((x) => x.id === f.category) : undefined
  if (c) out.push({ key: 'category', label: c.name, clear: { category: undefined } })
  const when = rangeLabel(f, b.today)
  if (when && (!shown.has('when') || !activeRange(f, b.today))) {
    // Scheduled entries sort soonest first; let go of that with the dates.
    out.push({ key: 'when', label: when, clear: { start: undefined, end: undefined, ...(isAhead(f, b.today) && f.sort === 'date' ? { dir: 'desc' as const } : {}) } })
  }
  const sort = f.sort !== 'date' || f.dir !== 'desc' ? SORTS.find(([, , x]) => x.sort === f.sort && x.dir === f.dir) : undefined
  if (sort && !shown.has('sort') && !(isAhead(f, b.today) && sort[0] === 'oldest')) out.push({ key: 'sort', label: sort[1], clear: { sort: 'date', dir: 'desc' } })
  if (f.tag) out.push({ key: 'tag', label: `#${f.tag}`, clear: { tag: undefined } })
  if (f.group) out.push({ key: 'group', label: 'One split purchase', clear: { group: undefined } })
  return out
}

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
  return ordered(ids, c?.order).map((id) => ({ id, label: label.get(id)!, on: !hidden.has(id) }))
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

/** The setting after one change: the rows or a row's chips put in a new order (as dragged), or one switched on or off. */
export function orderRows(s: Saved, ids: string[]): Saved {
  const rows = barRows(s)
  return { ...s, order: ordered(rows.map((r) => r.id), ids), hidden: rows.filter((r) => !r.on).map((r) => r.id) }
}
export function toggleRow(s: Saved, id: string, on: boolean): Saved {
  const rows = barRows(s)
  return { ...s, order: rows.map((r) => r.id), hidden: rows.filter((r) => (r.id === id ? !on : !r.on)).map((r) => r.id) }
}
export function orderChips(s: Saved, row: BarRow, b: Bootstrap, ids: string[]): Saved {
  const o = ordered(barChips(s, row, b).map((c) => c.id), ids)
  return { ...s, chips: { ...s.chips, [row]: { ...s.chips?.[row], order: o } } }
}
export function toggleChip(s: Saved, row: BarRow, id: string, on: boolean): Saved {
  const h = new Set(s.chips?.[row]?.hidden ?? [])
  if (on) h.delete(id); else h.add(id)
  return { ...s, chips: { ...s.chips, [row]: { ...s.chips?.[row], hidden: [...h] } } }
}
