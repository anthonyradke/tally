// Starting values for the Settings editor (edit.tsx): each form's fields as the text inputs show them.
import type { AdminData } from './api'
import { fromCents } from './draft'
import { parseDollars } from './money'
import { monthOf } from './dates'

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
      return x ? { name: x.name, kind: x.kind, bank: x.bank, start_balance: dollarsText(x.start_balance), apy: pctStr(x.apy), loan_rate: pctStr(x.loan_rate), ef: !!x.ef, sort: x.sort, active: !!x.active, color: x.color, icon: x.icon }
        : { name: '', kind: 'cash', bank: null, start_balance: '', apy: '', loan_rate: '', ef: false, sort: a.accounts.length, active: true, color: null, icon: null }
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
      return x ? { label: x.label, what: x.what, category_id: x.category_id, from_account_id: x.from_account_id, to_account_id: x.to_account_id, amount: dollarsText(x.amount), freq: x.freq, next_date: x.next_date, horizon_days: x.horizon_days, active: !!x.active }
        : { label: '', what: '', category_id: a.categories.find((r) => r.type === 'Spending' && r.active)?.id ?? null, from_account_id: null, to_account_id: null, amount: '', freq: 'monthly', next_date: today, horizon_days: 45, active: true }
    }
    case 'view': {
      const x = a.saved_views.find((r) => r.id === id)
      return { name: x?.name ?? '', query: x?.query ?? '', icon: x?.icon ?? null, sort: x?.sort ?? 0 }
    }
    case 'budget': {
      const x = a.categories.find((r) => r.id === id)
      const month = monthOf(today)
      const over = a.budgets.find((r) => r.category_id === id && r.month === month)
      return { amount: over ? dollarsText(over.amount) : x?.budget ? dollarsText(x.budget) : '', thisMonth: !!over }
    }
  }
  return {}
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
