// Settings after the second review: where a hidden account's items can move, suggestions that named a hidden account,
// the budget editor's months, and skipped dates in Recently deleted.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AdminAccount, AdminData, AdminRecurring, DeletedTxn, Favorite } from '@/lib/api'
import { asEntry, skippedFrom } from '@/lib/deleted'
import { budgetMode, budgetMonths, budgetText, initial, movable, moveTargets, standIn } from '@/lib/forms'
import { repeatPrefill, type Repeat } from '@/lib/repeats'
import { acct as account } from './fixtures.ts'

process.env.TZ = 'America/Denver'

const today = '2026-11-22'
const acct = (id: number, kind: AdminAccount['kind'], x: Partial<AdminAccount> = {}): AdminAccount => ({
  id, name: `A${id}`, kind, bank: null, start_balance: 0, apy: null, loan_rate: null, ef: 0, color: null, icon: null, active: 1, opened: null, sort: id, ...x,
})
const fav = (id: number, x: Partial<Favorite> = {}): Favorite =>
  ({ id, label: `Q${id}`, category_id: 2, from_account_id: 3, to_account_id: null, amount: null, sort: id, icon: null, color: null, ...x })
const bill = (x: Partial<AdminRecurring> = {}): AdminRecurring => ({
  id: 1, label: 'Rent', category_id: 2, from_account_id: 3, to_account_id: null, amount: 140000, what: 'Rent', freq: 'monthly',
  next_date: '2026-12-01', next_due: '2026-12-01', next_slot: '2026-12-01', horizon_days: 45, active: 1, anchor_day: 1, created_at: '', ...x,
})
const cats: AdminData['categories'] = [
  { id: 2, name: 'Dining', type: 'Spending', icon: null, color: null, budget: 30000, active: 1, sort: 0 },
  { id: 5, name: 'Pay', type: 'Money in', icon: null, color: null, budget: null, active: 1, sort: 1 },
  { id: 6, name: 'Card payment', type: 'Transfer', icon: null, color: null, budget: null, active: 1, sort: 2 },
]
const admin = (x: Partial<AdminData> = {}): AdminData => ({
  accounts: [], categories: cats, favorites: [], recurring: [], saved_views: [], budgets: [], skips: [], settings: {}, ...x,
})

test('a hidden card moves its spending to another card first, never to a loan or an investment', () => {
  // 1 checking, 3 the card being hidden, 4 a Roth IRA, 5 a student loan, 7 the other card
  const a = admin({ accounts: [acct(1, 'cash'), acct(3, 'card'), acct(4, 'investment'), acct(5, 'loan'), acct(7, 'card')], favorites: [fav(1), fav(2)], recurring: [bill()] })
  assert.deepEqual(moveTargets(a, 3, movable(a, 3)).map((x) => x.id), [7, 1])
  assert.equal(standIn(a.accounts, 3, moveTargets(a, 3, movable(a, 3)))?.id, 7)
})

test('money into a hidden account never moves onto a loan', () => {
  const a = admin({ accounts: [acct(1, 'cash'), acct(3, 'card'), acct(4, 'investment'), acct(5, 'loan')], favorites: [fav(1, { category_id: 6, from_account_id: 1, to_account_id: 3 })] })
  assert.deepEqual(moveTargets(a, 3, movable(a, 3)).map((x) => x.id), [4]) // 1 is its From already
  const pay = admin({ accounts: [acct(1, 'cash'), acct(3, 'cash'), acct(5, 'loan')], favorites: [fav(1, { category_id: 5, from_account_id: null, to_account_id: 3 })] })
  assert.deepEqual(moveTargets(pay, 3, movable(pay, 3)).map((x) => x.id), [1])
})

test('nothing is picked for you when two accounts of the kind could take them', () => {
  const a = admin({ accounts: [acct(3, 'card'), acct(7, 'card'), acct(8, 'card')], favorites: [fav(1)] })
  assert.equal(standIn(a.accounts, 3, moveTargets(a, 3, movable(a, 3))), null)
  assert.equal(standIn(a.accounts, 3, []), null)
})

const netflix: Repeat = { what: 'Netflix', category_id: 2, from_id: 3, to_id: null, amount: 1599, freq: 'monthly', next: '2026-12-04', seen: 2 }

test('a suggestion on a hidden card opens on the other card, and says so', () => {
  const { fields, note } = repeatPrefill(netflix, [account(1, 'cash'), account(3, 'card', 0, { name: 'Credit card', active: false }), account(7, 'card', 0, { name: 'Apple Card' })])
  assert.equal(fields.from_account_id, 7)
  assert.equal(fields.amount, '15.99')
  assert.equal(note, 'Credit card is hidden, so From is Apple Card here. Check it before saving.')
})

test('a suggestion on a hidden account with no clear stand-in leaves it to pick', () => {
  const { fields, note } = repeatPrefill(netflix, [account(1, 'cash'), account(3, 'card', 0, { name: 'Credit card', active: false })])
  assert.equal(fields.from_account_id, null)
  assert.equal(note, 'Credit card is hidden: pick the account for From. Check it before saving.')
  assert.equal(repeatPrefill({ ...netflix, from_id: 1 }, [account(1, 'cash')]).note, null)
})

test('the budget editor offers next month as well as this one', () => {
  assert.deepEqual(budgetMonths('2026-12-31'), { this: '2026-12-01', next: '2027-01-01' })
  const a = admin({ budgets: [{ category_id: 2, month: '2026-12-01', amount: 40000 }] })
  assert.equal(budgetText(a, 2, 'regular', today), '300')
  assert.equal(budgetText(a, 2, 'this', today), '') // no one-off for November: the regular shows as the placeholder
  assert.equal(budgetText(a, 2, 'next', today), '400')
  const f = initial('budget', 2, a, today)
  assert.equal(budgetMode(f), 'regular')
  assert.equal(budgetMode({ ...f, thisMonth: false, nextMonth: true }), 'next')
  assert.equal(budgetMode(initial('budget', 2, a, '2026-12-05')), 'this')
})

test('a skipped date is told apart from a deletion, and goes back as an entry', () => {
  const row = (id: number, skipped_from: string | null) => ({ id, deleted_at: '2026-11-22T17:00:00+00:00', batch: id, skipped_from }) as unknown as DeletedTxn
  assert.equal(skippedFrom([row(1, 'Rent')]), 'Rent')
  assert.equal(skippedFrom([row(1, null)]), null)
  assert.deepEqual(asEntry(row(1, 'Rent')), { id: 1 })
})
