import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fromLink } from '@/lib/capture'
import { acct, boot, cat, row } from './fixtures.ts'

const b = boot({ accounts: [acct(1, 'cash', 0, { name: 'Chase Checking' }), acct(2, 'card', 0, { name: 'Amex CC' })],
  categories: [cat(1, 'Money in', { name: 'Paycheck' }), cat(2, 'Spending', { name: 'Dining Out' }), cat(3, 'Spending', { name: 'Coffee' })] })
const history = [row('2026-09-20', 650, { what: 'Starbucks #123', category_id: 3, from_id: 2 }), row('2026-09-01', 500, { what: 'starbucks', category_id: 2, from_id: 1 })]

test('fromLink: amount, name, and what the last visit used', () => {
  assert.deepEqual(fromLink({ amount: '$6.50', what: 'Starbucks' }, b, history), { amount: '6.50', what: 'Starbucks', category_id: 2, from_id: 1, to_id: null, kind: 'Spending' })
})

test('fromLink: a card or category in the link wins, matched loosely', () => {
  const d = fromLink({ amount: '12', what: 'New Place', card: 'amex', category: 'coffee' }, b, history)
  assert.deepEqual(d, { amount: '12', what: 'New Place', category_id: 3, kind: 'Spending', from_id: 2 })
})

test('fromLink: nonsense is ignored', () => {
  assert.deepEqual(fromLink({ amount: 'abc', card: 'Visa' }, b, history), {})
  assert.deepEqual(fromLink({ amount: '-4.00' }, b, history), { amount: '4', refund: true })
})
