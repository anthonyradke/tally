// Starting values for the Settings editor (edit.tsx): each form's fields as the text inputs show them.
import type { AdminAccount, AdminData, AdminRecurring, Favorite, Freq, Recurring } from './api'
import { fromCents } from './draft'
import { parseDollars } from './money'
import { fromISO, monthOf } from './dates'

export type Form = Record<string, string | number | boolean | null>

/** Cents as the editor's dollar text, sign included: fromCents drops it (the composer keeps the sign apart), and a
 *  card that started in credit came back positive after any edit to the account. */
export const dollarsText = (c: number) => (c < 0 ? '-' : '') + fromCents(c)

/** A stored rate (0.0425) as the percent the editor shows ("4.25"). */
export const pctStr = (v: number | null) => (v == null ? '' : String(+(v * 100).toFixed(4)))

export function initial(kind: string, id: number | undefined, a: AdminData, today: string): Form {
  switch (kind) {
    case 'account': {
      const x = a.accounts.find((r) => r.id === id)
      return x ? { name: x.name, kind: x.kind, bank: x.bank, start_balance: dollarsText(x.start_balance), apy: pctStr(x.apy), loan_rate: pctStr(x.loan_rate), ef: !!x.ef, sort: x.sort, active: !!x.active, color: x.color, icon: x.icon, opened: x.opened?.slice(0, 7) ?? '' }
        : { name: '', kind: 'cash', bank: null, start_balance: '', apy: '', loan_rate: '', ef: false, sort: a.accounts.length, active: true, color: null, icon: null, opened: '' }
    }
    case 'category': {
      const x = a.categories.find((r) => r.id === id)
      return x ? { name: x.name, type: x.type, sort: x.sort, active: !!x.active, icon: x.icon, color: x.color, budget: x.budget ? dollarsText(x.budget) : '' }
        : { name: '', type: 'Spending', sort: a.categories.length, active: true, icon: null, color: null, budget: '' }
    }
    case 'quick': {
      const x = a.favorites.find((r) => r.id === id)
      return x ? { label: x.label, category_id: x.category_id, from_account_id: x.from_account_id, to_account_id: x.to_account_id, amount: x.amount ? dollarsText(x.amount) : '', sort: x.sort, icon: x.icon, color: x.color }
        : { label: '', category_id: a.categories.find((r) => r.type === 'Spending' && r.active)?.id ?? null, from_account_id: null, to_account_id: null, amount: '', sort: a.favorites.length, icon: null, color: null }
    }
    case 'recurring': {
      const x = a.recurring.find((r) => r.id === id)
      // No `active`: Pause and Resume act at once, and the save sends the template's own, read when it's sent. A copy
      // here went stale after Pause then Undo, and the save paused it again.
      return x ? { label: x.label, what: x.what, category_id: x.category_id, from_account_id: x.from_account_id, to_account_id: x.to_account_id, amount: dollarsText(x.amount), freq: x.freq, next_date: x.next_due ?? x.next_date, horizon_days: x.horizon_days }
        : { label: '', what: '', category_id: a.categories.find((r) => r.type === 'Spending' && r.active)?.id ?? null, from_account_id: null, to_account_id: null, amount: '', freq: 'monthly', next_date: today, horizon_days: 45 }
    }
    case 'view': {
      const x = a.saved_views.find((r) => r.id === id)
      return { name: x?.name ?? '', query: x?.query ?? '', icon: x?.icon ?? null, sort: x?.sort ?? 0 }
    }
    case 'budget': {
      const { regular, over } = budgetIn(a, id ?? 0, monthOf(today))
      return { amount: over != null ? dollarsText(over) : regular ? dollarsText(regular) : '', thisMonth: over != null }
    }
  }
  return {}
}

/** A category's regular budget and its one-off for a month ("YYYY-MM-01"), in cents; null when not set. */
export function budgetIn(a: AdminData, id: number, month: string): { regular: number | null; over: number | null } {
  return { regular: a.categories.find((x) => x.id === id)?.budget ?? null, over: a.budgets.find((r) => r.category_id === id && r.month === month)?.amount ?? null }
}

/** Dollar fields keyed by account id (month-end balances and interest) as cents, leaving out empty ones. A field
 *  that isn't a number ("1.2.3") comes back in `bad` so the screen can say so: it used to be saved as $0. */
export function amountsById(fields: Record<string, string>, positiveOnly = false): { cents: Record<number, number>; bad: string[] } {
  const cents: Record<number, number> = {}, bad: string[] = []
  for (const [k, v] of Object.entries(fields)) {
    if (v.trim() === '') continue
    const c = parseDollars(v)
    if (c === null) bad.push(k)
    else if (!positiveOnly || c > 0) cents[Number(k)] = c
  }
  return { cents, bad }
}

/** The budget editor's amount in cents: null clears the budget, undefined means it isn't a number (a typo used to
 *  clear the budget). */
export const budgetAmount = (text: string): number | null | undefined => (text.trim() === '' ? null : parseDollars(text) ?? undefined)

/** A saved template as the body `saveRecurring` takes (dollars), for an action that changes one thing about it from a
 *  list (pause, another account) without the editor. `move: false` keeps its schedule whatever the date says: the
 *  date can be a moment old (an Undo of a pause sent the one from before the pause, which read as a move and dropped
 *  the bills already scheduled). */
export const recurringBody = (r: Recurring): Form => ({
  label: r.label, what: r.what, category_id: r.category_id, from_account_id: r.from_account_id, to_account_id: r.to_account_id,
  amount: r.amount / 100, freq: r.freq, next_date: r.next_date, horizon_days: r.horizon_days, active: !!r.active, move: false,
})

/** The body that undoes a move of `r`'s date: back to where its schedule stood, aiming for its old day (without it, a
 *  bill on the 31st moved and moved back aimed for the 30th). */
export const unmoveBody = (r: AdminRecurring): Form => ({
  ...recurringBody(r), next_date: r.next_slot ?? r.next_due ?? r.next_date, anchor_day: r.anchor_day, move: true,
})

/** A quick action as the body `saveFavorite` takes. */
export const favoriteBody = (x: Favorite): Form => ({ ...x, amount: x.amount == null ? null : x.amount / 100 })

const ordinal = (n: number) => {
  const end = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${end}`
}

/** "Dec 3", with the year when it isn't this year. */
export function shortDay(iso: string, today: string): string {
  const d = fromISO(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() === fromISO(today).getFullYear() ? {} : { year: 'numeric' }) })
}

/** What a template does after its date moved, for the toast: "Rent now posts on the 3rd, starting Dec 3". `starts`
 *  is the first date it really posts when that's later (the date picked was skipped). */
export function movedText(label: string, freq: Freq, next: string, today: string, starts?: string): string {
  const d = fromISO(next)
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
  const when = freq === 'monthly' ? `on the ${ordinal(d.getDate())}`
    : freq === 'weekly' ? `on ${weekday}s`
    : freq === 'biweekly' ? `every other ${weekday}`
    : `each year on ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  return `${label || 'It'} now posts ${when}, starting ${shortDay(starts && starts > next ? starts : next, today)}`
}

type Sides = { from_account_id: number | null; to_account_id: number | null }
const uses = (x: Sides, id: number) => x.from_account_id === id || x.to_account_id === id

/** Quick actions and running recurring templates that post to an account, for when it's hidden. */
export function accountUsers(a: AdminData, id: number): { quick: Favorite[]; recurring: Recurring[] } {
  return { quick: a.favorites.filter((x) => uses(x, id)), recurring: a.recurring.filter((r) => r.active && uses(r, id)) }
}

/** What hiding an account offers to move: its users, paused templates included (resumed, one would post to the hidden
 *  account again). */
export function movable(a: AdminData, id: number): { quick: Favorite[]; recurring: Recurring[] } {
  const u = accountUsers(a, id)
  return { ...u, recurring: [...u.recurring, ...a.recurring.filter((r) => !r.active && uses(r, id))] }
}

/** Accounts those users can move to: shown ones that none of them already has on its other side (From and To the
 *  same account is refused, which left a hide half done). */
export function moveTargets(a: AdminData, id: number, u: { quick: Sides[]; recurring: Sides[] }): AdminAccount[] {
  const other = new Set([...u.quick, ...u.recurring].map((x) => (x.from_account_id === id ? x.to_account_id : x.from_account_id)))
  return a.accounts.filter((x) => x.active && x.id !== id && !other.has(x.id))
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "3 quick actions and 1 recurring bill", or "" when nothing uses it. */
export function usersText(u: { quick: unknown[]; recurring: unknown[] }): string {
  return [u.quick.length ? count(u.quick.length, 'quick action', 'quick actions') : '',
    u.recurring.length ? count(u.recurring.length, 'recurring bill', 'recurring bills') : ''].filter(Boolean).join(' and ')
}

/** The same item with one account swapped for another, on whichever side it was. */
export function swapAccount<T extends { from_account_id: number | null; to_account_id: number | null }>(x: T, from: number, to: number): T {
  return { ...x, from_account_id: x.from_account_id === from ? to : x.from_account_id, to_account_id: x.to_account_id === from ? to : x.to_account_id }
}

/** Whether the editor's fields differ from what it opened with (closing it then offers them back). */
export const changed = (start: Form, now: Form) => Object.keys({ ...start, ...now }).some((k) => String(start[k] ?? '') !== String(now[k] ?? ''))
