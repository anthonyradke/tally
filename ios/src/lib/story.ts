// The facts behind a month's story (app/story.tsx): what came in and went out, where it went, the biggest day, the
// favorite place, how it compares with the month before. Pure, from the bootstrap months and that month's rows.
import type { Bootstrap, Category, MonthRow, Txn } from './api'
import { budgetFor } from './budgets'
import { addDays, fromISO, lastOfMonth } from './dates'
import { merchantKey } from '@/icons/merchants'

export interface Story {
  m: MonthRow
  prev?: MonthRow
  entries: number
  /** Share of money in that was left over, 0..1, or null with nothing in. */
  kept: number | null
  top: { c: Category; cents: number; share: number }[]
  biggestDay: { date: string; cents: number; rows: Txn[] } | null
  biggest: Txn | null
  /** Days with no spending, out of the days in the month. */
  quiet: { days: number; of: number; streak: number }
  /** Days with some spending (refunds can net a day back to nothing). */
  spentDays: Set<string>
  favorite: { what: string; visits: number; cents: number } | null
  /** Category with the largest rise and the largest fall against the month before. */
  movers: { up?: { c: Category; by: number }; down?: { c: Category; by: number } }
  worth: { change: number; values: number[] } | null
  budgets: { kept: number; of: number } | null
  /** Spending against the month before: whole months, or for a month still going, both up to the same day. */
  vs: { now: number; before: number } | null
}

const isSpend = (b: Bootstrap) => {
  const types = new Map(b.categories.map((c) => [c.id, c.type]))
  return (t: Txn) => types.get(t.category_id) === 'Spending'
}

/** `rows`: the month's entries, and the month before's for comparing a month still going. */
export function buildStory(b: Bootstrap, month: string, rows: Txn[]): Story | null {
  const i = b.months.findIndex((r) => r.month === month)
  if (i < 0) return null
  const m = b.months[i], prev = b.months[i - 1]
  const end = lastOfMonth(month)
  // What has happened: a month still going leaves out its scheduled entries (rent due on the 31st isn't a big day yet).
  const inMonth = rows.filter((t) => t.date >= month && t.date <= end && t.date <= b.today)
  const spendRow = isSpend(b)
  const spending = inMonth.filter(spendRow)
  const cats = new Map(b.categories.map((c) => [c.id, c]))

  const byCat = Object.entries(m.by_category)
    .map(([id, cents]) => ({ c: cats.get(Number(id))!, cents }))
    .filter((x) => x.c?.type === 'Spending' && x.cents > 0).sort((a, z) => z.cents - a.cents)
  const top = byCat.slice(0, 3).map((x) => ({ ...x, share: m.spent > 0 ? x.cents / m.spent : 0 }))

  const days = new Map<string, Txn[]>()
  for (const t of spending) days.set(t.date, [...(days.get(t.date) ?? []), t])
  let biggestDay: Story['biggestDay'] = null
  for (const [date, list] of days) {
    const cents = list.reduce((n, t) => n + t.amount, 0)
    if (!biggestDay || cents > biggestDay.cents) biggestDay = { date, cents, rows: [...list].sort((a, z) => z.amount - a.amount).slice(0, 3) }
  }
  const biggest = spending.reduce<Txn | null>((x, t) => (!x || t.amount > x.amount ? t : x), null)

  // Quiet days count up to today in a month still going, so tomorrow isn't counted as a day without spending.
  const lastDay = b.today < end ? b.today : end
  const spentDays = new Set<string>()
  let quietDays = 0, streak = 0, run = 0, of = 0
  for (let d = month; d <= lastDay; d = addDays(d, 1)) {
    of++
    const spent = (days.get(d) ?? []).reduce((n, t) => n + t.amount, 0)
    if (spent <= 0) { quietDays++; run++; streak = Math.max(streak, run) } else { run = 0; spentDays.add(d) }
  }

  const visits = new Map<string, { what: string; visits: number; cents: number }>()
  for (const t of spending) {
    const k = merchantKey(t.what)
    if (!k) continue
    const v = visits.get(k) ?? { what: t.what, visits: 0, cents: 0 }
    visits.set(k, { what: v.what, visits: v.visits + 1, cents: v.cents + t.amount })
  }
  const favorite = [...visits.values()].filter((v) => v.visits >= 2)
    .sort((a, z) => z.visits - a.visits || z.cents - a.cents)[0] ?? null

  const movers: Story['movers'] = {}
  if (prev) {
    for (const c of b.categories) {
      if (c.type !== 'Spending') continue
      const by = (m.by_category[String(c.id)] ?? 0) - (prev.by_category[String(c.id)] ?? 0)
      if (by > 0 && by > (movers.up?.by ?? 0)) movers.up = { c, by }
      if (by < 0 && by < (movers.down?.by ?? 0)) movers.down = { c, by }
    }
  }

  const worthMonths = b.months.slice(0, i + 1)
  const worth = prev ? { change: m.net_worth - prev.net_worth, values: worthMonths.map((r) => r.net_worth) } : null

  let vs: Story['vs'] = null
  if (prev) {
    if (b.today >= end) vs = { now: m.spent, before: prev.spent }
    else {
      const day = Number(b.today.slice(8))
      const before = rows.filter((t) => t.date >= prev.month && t.date < month && Number(t.date.slice(8)) <= day && spendRow(t))
      vs = { now: spending.reduce((n, t) => n + t.amount, 0), before: before.reduce((n, t) => n + t.amount, 0) }
    }
  }

  let kept = 0, of2 = 0
  for (const c of b.categories) {
    if (c.type !== 'Spending' || !c.active) continue
    const cap = budgetFor(b, c, month)
    if (!cap) continue
    of2++
    if ((m.by_category[String(c.id)] ?? 0) <= cap) kept++
  }

  return {
    m, prev, entries: inMonth.length,
    kept: m.money_in > 0 ? m.left_over / m.money_in : null,
    top, biggestDay, biggest, quiet: { days: quietDays, of, streak }, spentDays, favorite, movers, worth,
    budgets: of2 ? { kept, of: of2 } : null, vs,
  }
}

/** "Saturday the 26th" */
export function dayName(iso: string): string {
  const d = fromISO(iso)
  const n = d.getDate()
  const th = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'
  return `${d.toLocaleDateString('en-US', { weekday: 'long' })} the ${n}${th}`
}
