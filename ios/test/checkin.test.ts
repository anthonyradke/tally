// The check-in's rules: what a row adds with the picks made on it, how Add All sends them, which accounts a bank
// account can be, and when the sheet may come up by itself.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import storage from '@react-native-async-storage/async-storage'
import { ApiError, type BankGuess, type BankRow } from '@/lib/api'
import { addAllPlan, already, kindsFor, loadSeenFor, mayPop, PATIENCE_MS, RECHECK_MS, rowPlan, saveSeenFor, shouldLook } from '@/design/checkin'

const types: Record<number, { type: 'Spending' | 'Transfer' | 'Loan' | 'Money in' }> = { 1: { type: 'Spending' }, 2: { type: 'Spending' }, 3: { type: 'Transfer' }, 4: { type: 'Loan' }, 5: { type: 'Money in' } }
const catOf = (id: number) => types[id]
const guess = (x: Partial<BankGuess>): BankGuess => ({ what: 'Costco', category_id: 1, from_id: 10, to_id: null, amount: 500, confidence: 'likely', source: 'history', why: '', pair_id: null, ...x })
const row = (id: number, amount: number, g: BankGuess | null): Pick<BankRow, 'id' | 'account_id' | 'amount' | 'guess'> => ({ id, account_id: 10, amount, guess: g })

test('a row left as guessed sends nothing over the guess', () => {
  const p = rowPlan(row(1, 500, guess({})), undefined, catOf)
  assert.equal(p.ready, true)
  assert.equal(p.same, true)
  assert.deepEqual(p.body, {})
})

test('a picked category sends it, with the sides a move needs', () => {
  const p = rowPlan(row(1, 500, guess({})), { cat: 2 }, catOf)
  assert.deepEqual(p.body, { category_id: 2 })
  const t = rowPlan(row(1, 500, guess({})), { cat: 3 }, catOf)
  assert.equal(t.ready, false) // a transfer needs the other account
  const t2 = rowPlan(row(1, 500, guess({})), { cat: 3, other: 11 }, catOf)
  assert.deepEqual(t2.body, { category_id: 3, from_id: 10, to_id: 11 })
  const inbound = rowPlan(row(1, -500, null), { cat: 3, other: 11 }, catOf)
  assert.deepEqual(inbound.body, { category_id: 3, from_id: 11, to_id: 10 })
  const loan = rowPlan(row(1, 500, null), { cat: 4 }, catOf)
  assert.equal(loan.ready, true) // a loan payment's To is optional
})

test('a row without a guess waits for a category', () => {
  assert.equal(rowPlan(row(1, 500, null), undefined, catOf).ready, false)
  assert.equal(rowPlan(row(1, 500, guess({ category_id: null })), undefined, catOf).ready, false)
})

test('Add All sends guessed rows by id and picked ones with their picks', () => {
  const rows = [row(1, 500, guess({})), row(2, 700, guess({})), row(3, 900, null), row(4, 100, null)]
  const plan = addAllPlan(rows, { 2: { cat: 2 }, 3: { cat: 1 } }, catOf)
  assert.deepEqual(plan.ids, [1])
  assert.deepEqual(plan.each, [{ id: 2, body: { category_id: 2 } }, { id: 3, body: { category_id: 1 } }])
  assert.equal(plan.count, 3) // row 4 has no category yet
})

test('bank account kinds follow Plaid types', () => {
  assert.deepEqual(kindsFor('credit', 'credit card'), ['card'])
  assert.deepEqual(kindsFor('depository', 'checking'), ['cash'])
  assert.deepEqual(kindsFor('depository', 'hsa'), ['cash', 'investment'])
  assert.deepEqual(kindsFor('loan', 'student'), ['loan'])
  assert.deepEqual(kindsFor('other', null), [])
})

test('someone got there first: 409 and 404 are quiet', () => {
  assert.equal(already(new ApiError(409, ['done'])), true)
  assert.equal(already(new ApiError(404, ['gone'])), true)
  assert.equal(already(new ApiError(422, ['bad'])), false)
  assert.equal(already(new TypeError('offline')), false)
})

test('the last look is kept per server', async () => {
  ;(storage as unknown as { clear(): void }).clear()
  await saveSeenFor('https://a', { day: '2026-11-25', maxId: 9 })
  assert.deepEqual(await loadSeenFor('https://a'), { day: '2026-11-25', maxId: 9 })
  assert.equal(await loadSeenFor('https://b'), null)
})

test('the sheet only comes up on the same tab root, soon after the look began', () => {
  const roots = new Set(['/', '/activity'])
  const base = { roots, startPath: '/', path: '/', startedAt: 0, now: 1000, active: true }
  assert.equal(mayPop(base), true)
  assert.equal(mayPop({ ...base, path: '/activity' }), false) // moved to another tab
  assert.equal(mayPop({ ...base, startPath: '/txn/4', path: '/txn/4' }), false) // not a root
  assert.equal(mayPop({ ...base, now: PATIENCE_MS + 1 }), false) // too late
  assert.equal(mayPop({ ...base, active: false }), false)
})

test('looks only on a real return to the app, and not again within a few minutes', () => {
  assert.equal(shouldLook(true, 0, RECHECK_MS), true)
  assert.equal(shouldLook(false, 0, RECHECK_MS), false) // Control Center, Face ID: never left
  assert.equal(shouldLook(true, 0, RECHECK_MS - 1), false)
})
