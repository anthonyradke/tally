// Pending bank rows in Activity and on an account's page.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PendingTxn } from '@/lib/api'
import { pendingAmount, pendingFor, pendingOn, pendingSub } from '@/design/pending'

const row = (id: number, type: PendingTxn['type'], amount: number, account_id = 1, from_id: number | null = account_id, to_id: number | null = null): PendingTxn =>
  ({ id, date: '2026-11-25', what: `Row ${id}`, category_id: null, type, amount, from_id, to_id, account_id, raw: '', merchant: null, logo: null, website: null })

const rows = [row(1, 'Spending', 1250), row(2, 'Money in', 200000, 2, null, 2), row(3, 'Transfer', 5000, 2, 2, 3), row(4, 'Spending', -900), row(5, 'Loan', 4000, 2, 2, 9)]

test('each filter shows the pending rows that belong to it', () => {
  assert.deepEqual(pendingFor(rows, 'all').map((r) => r.id), [1, 2, 3, 4, 5])
  assert.deepEqual(pendingFor(rows, 'Spending').map((r) => r.id), [1, 4]) // a refund is spending's
  assert.deepEqual(pendingFor(rows, 'Money in').map((r) => r.id), [2])
  assert.deepEqual(pendingFor(rows, 'Transfer').map((r) => r.id), [3, 5])
})

test('no pending rows while searching or without bank sync', () => {
  assert.deepEqual(pendingFor(rows, 'all', 'coffee'), [])
  assert.deepEqual(pendingFor(null, 'all'), [])
  assert.deepEqual(pendingFor(undefined, 'Spending'), [])
})

test('an account page shows its own pending rows', () => {
  assert.deepEqual(pendingOn(rows, 2).map((r) => r.id), [2, 3, 5])
  assert.deepEqual(pendingOn(null, 2), [])
})

test('a pending row reads like the entry it would become', () => {
  assert.deepEqual(pendingAmount(rows[0]), { cents: 1250, plus: false, tone: 'plain' })
  assert.deepEqual(pendingAmount(rows[1]), { cents: 200000, plus: true, tone: 'pos' })
  assert.deepEqual(pendingAmount(rows[3]), { cents: 900, plus: true, tone: 'pos' }) // refund: green +
  assert.deepEqual(pendingAmount(rows[2]), { cents: 5000, plus: false, tone: 'quiet' })
  // On its account's page, like the statement: money out of cash with a −, a card charge plain.
  assert.deepEqual(pendingAmount(rows[2], { id: 2, kind: 'cash' }), { cents: -5000, plus: false, tone: 'plain' })
  assert.deepEqual(pendingAmount(rows[0], { id: 1, kind: 'card' }), { cents: 1250, plus: false, tone: 'plain' })
  assert.equal(pendingSub('Amex CC'), 'Pending · Amex CC')
  assert.equal(pendingSub(undefined), 'Pending')
})
