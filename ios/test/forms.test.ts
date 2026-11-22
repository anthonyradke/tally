import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AdminData, AdminRecurring, Favorite } from '@/lib/api'
import { accountUsers, budgetIn, changed, initial, movedText, recurringBody, swapAccount, usersText } from '@/lib/forms'

process.env.TZ = 'America/Denver'

const today = '2026-11-22'

const rent = (x: Partial<AdminRecurring> = {}): AdminRecurring => ({
  id: 1, label: 'Rent', category_id: 2, from_account_id: 1, to_account_id: null, amount: 140000, what: 'Rent', freq: 'monthly',
  next_date: '2027-02-01', next_due: '2026-12-01', horizon_days: 45, active: 1, anchor_day: 1, created_at: '', ...x,
})
const fav = (id: number, x: Partial<Favorite> = {}): Favorite =>
  ({ id, label: `Q${id}`, category_id: 2, from_account_id: 3, to_account_id: null, amount: null, sort: id, icon: null, color: null, ...x })
const admin = (x: Partial<AdminData> = {}): AdminData => ({
  accounts: [], categories: [{ id: 2, name: 'Dining', type: 'Spending', icon: null, color: null, budget: 30000, active: 1, sort: 0 }],
  favorites: [], recurring: [], saved_views: [], budgets: [], skips: [], settings: {}, ...x,
})

test('the recurring editor opens on the next date that will happen, not the template’s own', () => {
  const f = initial('recurring', 1, admin({ recurring: [rent()] }), today)
  assert.equal(f.next_date, '2026-12-01')
  // An older server sends no next_due: the template's own date is all there is.
  assert.equal(initial('recurring', 1, admin({ recurring: [rent({ next_due: undefined })] }), today).next_date, '2027-02-01')
})

test('a moved template says when it posts now', () => {
  assert.equal(movedText('Rent', 'monthly', '2026-12-03', today), 'Rent now posts on the 3rd, starting Dec 3')
  assert.equal(movedText('Rent', 'monthly', '2027-01-22', today), 'Rent now posts on the 22nd, starting Jan 22, 2027')
  assert.equal(movedText('Pay', 'biweekly', '2026-12-04', today), 'Pay now posts every other Friday, starting Dec 4')
  assert.equal(movedText('Gym', 'weekly', '2026-11-30', today), 'Gym now posts on Mondays, starting Nov 30')
  assert.equal(movedText('Domain', 'yearly', '2027-03-11', today), 'Domain now posts each year on Mar 11, starting Mar 11, 2027')
  assert.equal(movedText('', 'monthly', '2026-12-11', today), 'It now posts on the 11th, starting Dec 11')
})

test('a template as a save body carries dollars and its own next date', () => {
  const b = recurringBody(rent())
  assert.equal(b.amount, 1400)
  assert.equal(b.next_date, '2027-02-01')
  assert.equal(b.active, true)
})

test('hiding an account finds the quick actions and running bills that post to it', () => {
  const a = admin({ favorites: [fav(1), fav(2, { from_account_id: 4, to_account_id: 3 }), fav(3, { from_account_id: 4 })],
    recurring: [rent({ id: 1, from_account_id: 3 }), rent({ id: 2, from_account_id: 3, active: 0 })] })
  const u = accountUsers(a, 3)
  assert.deepEqual(u.quick.map((x) => x.id), [1, 2])
  assert.deepEqual(u.recurring.map((x) => x.id), [1]) // a paused one posts nothing
  assert.equal(usersText(u), '2 quick actions and 1 recurring bill')
  assert.equal(usersText({ quick: [], recurring: [1, 2] }), '2 recurring bills')
  assert.equal(usersText({ quick: [], recurring: [] }), '')
})

test('moving to another account swaps whichever side used it', () => {
  assert.deepEqual(swapAccount({ from_account_id: 3, to_account_id: 5 }, 3, 9), { from_account_id: 9, to_account_id: 5 })
  assert.deepEqual(swapAccount({ from_account_id: 4, to_account_id: 3 }, 3, 9), { from_account_id: 4, to_account_id: 9 })
})

test('the editor only counts as changed when a field differs as text', () => {
  assert.equal(changed({ amount: '12', active: true }, { amount: '12', active: true }), false)
  assert.equal(changed({ amount: '12' }, { amount: '12.5' }), true)
  assert.equal(changed({ color: null }, { color: '' }), false)
  assert.equal(changed({ name: 'A' }, { name: 'A', move_to: 4 }), true)
})

test('a budget is its regular amount, or a one-off for one month', () => {
  const a = admin({ budgets: [{ category_id: 2, month: '2026-12-01', amount: 60000 }] })
  assert.deepEqual(budgetIn(a, 2, '2026-12-01'), { regular: 30000, over: 60000 })
  assert.deepEqual(budgetIn(a, 2, '2026-11-01'), { regular: 30000, over: null })
  assert.deepEqual(initial('budget', 2, a, '2026-12-05'), { amount: '600', thisMonth: true })
})
