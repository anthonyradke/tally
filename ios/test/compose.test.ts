// The composer's rules: which accounts and categories each kind of entry offers, when it can save, and how an
// edited amount loads and types.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountChoices, addedText, categoryChoices, entryOf, fromKinds, loadedAmount, needsTo, offered, ready, toKinds, typedBase, undoInput } from '@/design/compose'
import { acct, cat, row } from './fixtures'

const checking = acct(1, 'cash'), card = acct(2, 'card'), hsa = acct(3, 'investment'), loan = acct(4, 'loan')
const old = acct(5, 'card', 0, { active: false })
const all = [card, checking, hsa, loan, old]
const ids = (xs: { id: number }[]) => xs.map((x) => x.id)

test('expense and income offer cash, cards and investments (an HSA pays), never loans', () => {
  assert.deepEqual(ids(accountChoices(all, fromKinds('out'), null)), [1, 2, 3])
  assert.deepEqual(ids(accountChoices(all, toKinds('in'), null)), [1, 2, 3])
})

test('the To list follows the category', () => {
  const pick = (c: Parameters<typeof toKinds>[1]) => ids(accountChoices(all, toKinds('move', c), null, 1))
  assert.deepEqual(pick({ name: 'Loan Payment', type: 'Loan' }), [4])
  assert.deepEqual(pick({ name: 'Investing', type: 'Saving' }), [3])
  assert.deepEqual(pick({ name: 'Credit Card Payment', type: 'Transfer' }), [2])
  assert.deepEqual(pick({ name: 'Between Accounts', type: 'Transfer' }), [2, 3])
  assert.deepEqual(pick(undefined), [2, 3, 4])
})

test('hidden accounts and categories stay only as the current value', () => {
  assert.equal(offered(accountChoices(all, fromKinds('out'), null), 5), false)
  assert.deepEqual(ids(accountChoices(all, fromKinds('out'), 5)), [1, 2, 5, 3]) // in its kind's place
  assert.deepEqual(ids(accountChoices(all, fromKinds('out'), 4)), [1, 2, 3, 4]) // a loan From on an old entry
  const cats = [cat(1, 'Spending'), cat(2, 'Spending', { active: false }), cat(3, 'Money in')]
  assert.deepEqual(ids(categoryChoices(cats, ['Spending'], null)), [1])
  assert.deepEqual(ids(categoryChoices(cats, ['Spending'], 2)), [1, 2])
})

test('To is required only for money in and transfers', () => {
  assert.equal(needsTo('in', 'Money in'), true)
  assert.equal(needsTo('move', 'Transfer'), true)
  assert.equal(needsTo('move', 'Loan'), false)
  assert.equal(needsTo('move', 'Saving'), false)
  const f = { mode: 'move' as const, cents: 500, cat: 9, from: 1, to: null }
  assert.equal(ready({ ...f, type: 'Loan' }), true)
  assert.equal(ready({ ...f, type: 'Transfer' }), false)
  assert.equal(ready({ ...f, type: 'Transfer', to: 1 }), false) // same account both sides
  assert.equal(ready({ ...f, type: 'Transfer', to: 2 }), true)
  assert.equal(ready({ mode: 'out', cents: 0, cat: 2, type: 'Spending', from: 1, to: null }), false)
  assert.equal(ready({ mode: 'in', cents: 100, cat: 1, type: 'Money in', from: null, to: null }), false)
})

test('a loaded amount keeps its cents and is replaced by the first key', () => {
  assert.equal(loadedAmount(4500), '45')
  assert.equal(loadedAmount(1250), '12.50')
  assert.equal(loadedAmount(-2000), '20')
  assert.equal(typedBase('45', '6', true), '')
  assert.equal(typedBase('45', '.', true), '')
  assert.equal(typedBase('45', '⌫', true), '45')
  assert.equal(typedBase('45', '6', false), '45')
})

test('the entry keeps its sign and fills the sides its type takes', () => {
  assert.deepEqual(entryOf({ mode: 'out', cents: 2000, neg: true, from: 1, to: 2 }), { amount: -2000, from_id: 1, to_id: null })
  assert.deepEqual(entryOf({ mode: 'in', cents: 500, neg: true, from: 1, to: 2 }), { amount: -500, from_id: null, to_id: 2 })
  assert.deepEqual(entryOf({ mode: 'move', cents: 500, neg: false, from: 1, to: null }), { amount: 500, from_id: 1, to_id: null })
})

test('edit undo and the added notice', () => {
  const t = row('2026-11-01', 1234, { what: 'Costco', note: 'n', tags: ['x'], split_group: 'g' })
  assert.deepEqual(undoInput(t), { date: '2026-11-01', what: 'Costco', category_id: 2, amount: 1234, from_id: 1, to_id: null, note: 'n', tags: ['x'] })
  assert.equal(addedText('Costco', false), 'Added Costco')
  assert.equal(addedText('Costco', true), 'Added Costco Refund')
})
