// Entries that look like they repeat (a subscription, rent, a paycheck) but have no recurring template yet, for
// Settings → Recurring to offer. Strict on purpose: same name, category and accounts, a steady gap and nearly the
// same amount each time, so a weekly grocery run doesn't show up as "rent".
import type { Account, Freq, Recurring, Txn } from './api'
import { addDays, fromISO, toISO } from './dates'
import { dollarsText, standIn, type Form } from './forms'
import { merchantKey } from '@/icons/merchants'

export interface Repeat { what: string; category_id: number; from_id: number | null; to_id: number | null; amount: number; freq: Freq; next: string; seen: number }

const daysBetween = (a: string, b: string) => Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 864e5)
const GAPS: [Freq, number, number, number][] = [['weekly', 6, 8, 3], ['biweekly', 13, 15, 3], ['monthly', 26, 35, 2]] // freq, min gap, max gap, how many

function nextFrom(last: string, freq: Freq): string {
  if (freq === 'weekly') return addDays(last, 7)
  if (freq === 'biweekly') return addDays(last, 14)
  const d = fromISO(last)
  const end = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate()
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), end)))
}

/** Hand-typed rows grouped by place, category and accounts, oldest first: what both finders look for a rhythm in.
 *  Template rows, split parts, refunds and anything ahead of today stay out. */
function groups(rows: Txn[], today: string): Txn[][] {
  const out = new Map<string, Txn[]>()
  for (const t of rows) {
    if (t.date > today || t.recurring_id || t.split_group || t.amount <= 0) continue
    const k = merchantKey(t.what)
    if (!k) continue
    const key = `${t.category_id}|${k}|${t.from_id ?? ''}|${t.to_id ?? ''}`
    const list = out.get(key)
    if (list) list.push(t)
    else out.set(key, [t])
  }
  return [...out.values()]
}

/** Every gap in `run` between `lo` and `hi` days. */
const steady = (run: Txn[], lo: number, hi: number) =>
  run.every((t, i) => i === 0 || (daysBetween(run[i - 1].date, t.date) >= lo && daysBetween(run[i - 1].date, t.date) <= hi))

/** Each amount within `share` of the run's last one. */
const close = (run: Txn[], share: number) => run.every((t) => Math.abs(t.amount - run[run.length - 1].amount) <= run[run.length - 1].amount * share)

/** `rows` oldest first, as useAllTxns returns them. Newest pattern first. */
export function findRepeats(rows: Txn[], recurring: Recurring[], today: string): Repeat[] {
  const planned = new Set(recurring.map((r) => `${r.category_id}|${merchantKey(r.what || r.label)}`))
  const out: Repeat[] = []
  for (const list of groups(rows, today)) {
    const last = list[list.length - 1]
    if (planned.has(`${last.category_id}|${merchantKey(last.what)}`)) continue
    for (const [freq, lo, hi, need] of GAPS) {
      const run = list.slice(-need)
      if (run.length < need) continue
      const next = nextFrom(last.date, freq)
      if (!steady(run, lo, hi) || !close(run, need === 2 ? 0.05 : 0.1) || next < today) continue // stopped: its next date has already gone by
      out.push({ what: last.what, category_id: last.category_id, from_id: last.from_id, to_id: last.to_id, amount: last.amount, freq, next, seen: run.length })
      break
    }
  }
  return out.sort((a, z) => (a.next < z.next ? -1 : 1))
}

/** Places that are bills by their rhythm though no template posts them, as `category|place` keys (budgets'
 *  `billTest`). The place never comes twice within a month, and somewhere in its history it has the monthly rhythm
 *  `findRepeats` offers ("Looks like it repeats": two a month apart at nearly the same amount) or three a month apart
 *  at amounts within 2x of each other, since a utility bill typed by hand changes with the season. A place visited
 *  now and then (a salad place twice a month, once a month for a while) is everyday spending; a bill that has since
 *  stopped was still a bill in its months. */
export function billKeys(rows: Txn[], today: string): Set<string> {
  const [, lo, hi] = GAPS.find(([f]) => f === 'monthly')!
  const out = new Set<string>()
  for (const list of groups(rows, today)) {
    if (list.some((t, i) => i > 0 && daysBetween(list[i - 1].date, t.date) < lo)) continue
    for (let i = 1; i < list.length; i++) {
      const pair = list.slice(i - 1, i + 1), three = i >= 2 ? list.slice(i - 2, i + 1) : null
      const amounts = three?.map((t) => t.amount) ?? []
      if ((steady(pair, lo, hi) && close(pair, 0.05)) || (three && steady(three, lo, hi) && Math.max(...amounts) <= 2 * Math.min(...amounts))) {
        out.add(`${list[i].category_id}|${merchantKey(list[i].what)}`)
        break
      }
    }
  }
  return out
}

/** A suggestion as the recurring editor's starting fields. An account hidden since those entries were made is swapped
 *  for the only shown one of its kind, or left for you to pick, and `note` says which: saved as it was, the new
 *  template posted to the account just hidden. */
export function repeatPrefill(r: Repeat, accounts: Account[]): { fields: Form; note: string | null } {
  const notes: string[] = []
  const side = (id: number | null, name: string): number | null => {
    const a = id == null ? undefined : accounts.find((x) => x.id === id)
    if (!a || a.active) return id
    const s = standIn(accounts, a.id)
    notes.push(s ? `${a.name} is hidden, so ${name} is ${s.name} here.` : `${a.name} is hidden: pick the account for ${name}.`)
    return s?.id ?? null
  }
  const fields: Form = {
    label: r.what, what: r.what, category_id: r.category_id, from_account_id: side(r.from_id, 'From'), to_account_id: side(r.to_id, 'To'),
    amount: dollarsText(r.amount), freq: r.freq, next_date: r.next,
  }
  return { fields, note: notes.length ? `${notes.join(' ')} Check it before saving.` : null }
}
