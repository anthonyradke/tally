// Small made-up Bootstrap payloads for the app's pure logic.
import type { Account, Bootstrap, Category, MonthRow, Txn } from '@/lib/api'

export const acct = (id: number, kind: Account['kind'], start = 0, x: Partial<Account> = {}): Account =>
  ({ id, name: `A${id}`, kind, bank: null, start_balance: start, apy: null, loan_rate: null, ef: false, color: null, icon: null, active: true, ...x })
export const cat = (id: number, type: Category['type'], x: Partial<Category> = {}): Category =>
  ({ id, name: `C${id}`, type, icon: null, color: null, budget: null, active: true, ...x })
export const month = (m: string, x: Partial<MonthRow> = {}): MonthRow =>
  ({ month: m, money_in: 0, spent: 0, loan: 0, saving: 0, left_over: 0, by_category: {}, balances: {}, cash: 0, invested: 0, cards: 0, loans: 0, net_worth: 0, ...x })
let nextId = 1
export const row = (date: string, amount: number, x: Partial<Txn> = {}): Txn =>
  ({ id: nextId++, date, what: '', category_id: 2, from_id: 1, to_id: null, amount, note: '', tags: [], split_group: null, receipt: null, recurring_id: null, ...x })
export const boot = (x: Partial<Bootstrap> = {}): Bootstrap => ({
  today: '2026-09-24', start: '2026-08-01', accounts: [acct(1, 'cash', 1000)], categories: [cat(1, 'Money in'), cat(2, 'Spending')],
  favorites: [], budgets: [], recurring: [], saved_views: [], settings: {}, months: [month('2026-08-01'), month('2026-09-01')],
  ef: { goal: 0, progress: 0 }, roth: { ytd: 0, limit: 0, category_id: null }, ...x,
})
