import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AdminData, CatType, Txn } from '@/lib/api'
import { blank, fromCents, fromTxn, press, toCents, toInputs } from '@/lib/draft'
import { amountsById, budgetAmount, initial } from '@/lib/forms'
import { rand } from './util.ts'
import { row } from './fixtures.ts'

const type = (keys: string) => [...keys].reduce((s, k) => press(s, k === '<' ? 'del' : k), '')

test('keypad: two decimals, no leading zeros, capped at $9,999,999', () => {
  assert.equal(type('0012.345'), '12.34')
  assert.equal(type('.5'), '0.5')
  assert.equal(type('1..2'), '1.2')
  assert.equal(type('12<<'), '')
  assert.equal(type('<'), '')
  assert.equal(type('99999999'), '9999999')
  assert.equal(type('9999998.99'), '9999998.99')
  assert.equal(type('9999999.9'), '9999999.') // the cap is whole dollars
  assert.equal(type('0'), '0')
  assert.equal(type('00'), '0')
})

test('toCents and fromCents', () => {
  assert.equal(toCents(''), 0)
  assert.equal(toCents('12.5'), 1250)
  assert.equal(toCents('0.07'), 7)
  assert.equal(toCents('9999999.99'), 999999999)
  assert.equal(toCents('junk'), 0)
  assert.equal(fromCents(1250), '12.50')
  assert.equal(fromCents(1200), '12')
  const r = rand(7)
  for (let i = 0; i < 20000; i++) {
    const c = Math.floor(r() * 1_000_000_000)
    assert.equal(toCents(fromCents(c)), c)
  }
})

const TYPES: CatType[] = ['Money in', 'Spending', 'Transfer', 'Saving', 'Loan']
const shaped = (ty: CatType, amount: number): Txn => row('2026-09-10', amount, {
  what: 'x', note: 'n', tags: ['a'], category_id: 7,
  from_id: ty === 'Money in' ? null : 1, to_id: ty === 'Spending' || ty === 'Saving' ? null : 2,
})

test('editing an entry and saving it unchanged sends the same entry back', () => {
  for (const ty of TYPES) for (const amount of [1234, -1234]) {
    const t = shaped(ty, amount)
    const [line] = toInputs(fromTxn(t, ty))
    assert.deepEqual(line, { date: t.date, what: t.what, from_id: t.from_id, to_id: t.to_id, note: t.note, tags: t.tags, category_id: 7, amount: t.amount }, `${ty} ${amount}`)
  }
})

test('toInputs: refunds are negative, blank sides are dropped, splits send a line each', () => {
  const d = { ...blank('2026-09-24'), category_id: 2, from_id: 1, to_id: 5, amount: '12.5', refund: true, what: ' Store ' }
  assert.deepEqual(toInputs(d), [{ date: '2026-09-24', what: 'Store', from_id: 1, to_id: null, note: '', tags: [], category_id: 2, amount: -1250 }])
  const s = toInputs({ ...d, refund: false, split: [{ key: 'a', category_id: 2, amount: '10' }, { key: 'b', category_id: 3, amount: '2.5' }] })
  assert.deepEqual(s.map((l) => [l.category_id, l.amount]), [[2, 1000], [3, 250]])
})

test('the settings editor shows stored amounts with their sign', () => {
  const a = {
    accounts: [{ id: 1, name: 'Card', kind: 'card', bank: null, start_balance: -2550, apy: null, loan_rate: null, ef: 0, color: null, icon: null, sort: 0, active: 1 }],
    categories: [{ id: 2, name: 'Refunds', type: 'Spending', icon: null, color: null, budget: 5000, sort: 0, active: 1 }],
    favorites: [{ id: 3, label: 'Return', category_id: 2, from_account_id: 1, to_account_id: null, amount: -1999, sort: 0, icon: null, color: null }],
    recurring: [{ id: 4, label: 'Rebate', category_id: 2, from_account_id: 1, to_account_id: null, amount: -500, what: '', freq: 'monthly', next_date: '2026-10-01', horizon_days: 45, active: 1 }],
    saved_views: [], budgets: [], settings: {},
  } as unknown as AdminData
  assert.equal(toCents(String(initial('account', 1, a, '2026-09-24').start_balance)), -2550)
  assert.equal(toCents(String(initial('quick', 3, a, '2026-09-24').amount)), -1999)
  assert.equal(toCents(String(initial('recurring', 4, a, '2026-09-24').amount)), -500)
  assert.equal(initial('category', 2, a, '2026-09-24').budget, '50')
})

test('month-end fields: a typo is flagged, never saved as $0', () => {
  const r = amountsById({ 4: '1.2.3', 5: '10', 6: '' })
  assert.deepEqual(r.bad, ['4'])
  assert.deepEqual(r.cents, { 5: 1000 })
  assert.deepEqual(amountsById({ 7: '0', 8: '3.5' }, true).cents, { 8: 350 })
})

test('budget field: empty clears, a typo is not a number', () => {
  assert.equal(budgetAmount(''), null)
  assert.equal(budgetAmount('12.50'), 1250)
  assert.equal(budgetAmount('1.2.3'), undefined)
  assert.equal(budgetAmount('abc'), undefined)
})
