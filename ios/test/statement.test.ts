// Activity filtered to one account reads like its statement: signed amounts and the balance each day ended on.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CatType, Txn } from '@/lib/api'
import { balanceOn } from '@/lib/balances'
import { accountAmount, closingBalances, deletedMatches, feedItems, isStatement, type FeedOptions } from '@/lib/feed'
import { EMPTY } from '@/lib/filters'
import { acct, row } from './fixtures.ts'

test('statement: only one account on its own, by date', () => {
  assert.ok(isStatement({ ...EMPTY, account: 3 }))
  assert.ok(isStatement({ ...EMPTY, account: 3, start: '2026-10-01', end: '2026-10-31', dir: 'asc' })) // a statement period
  assert.ok(!isStatement(EMPTY))
  assert.ok(!isStatement({ ...EMPTY, account: 3, category: 5 }))
  assert.ok(!isStatement({ ...EMPTY, account: 3, q: 'rent' }))
  assert.ok(!isStatement({ ...EMPTY, account: 3, type: 'Spending' }))
  assert.ok(!isStatement({ ...EMPTY, account: 3, tag: 'trip' }))
  assert.ok(!isStatement({ ...EMPTY, account: 3, sort: 'amount' }))
})

test('statement: each day closes on the balance the engine rules give, whatever order the rows come in', () => {
  const checking = acct(1, 'cash', 100000)
  const rows: Txn[] = [
    row('2026-11-12', 140000, { from_id: 1 }), // rent
    row('2026-11-10', 300000, { from_id: null, to_id: 1, category_id: 1 }), // pay
    row('2026-11-12', 40000, { from_id: 1, to_id: 2 }), // to savings
    row('2026-11-11', 999, { from_id: 2 }), // another account's
    row('2026-07-01', 5000, { from_id: 1 }), // before the ledger starts
  ]
  const closing = closingBalances(checking, rows, '2026-08-01')
  assert.deepEqual([...closing], [['2026-11-10', 400000], ['2026-11-12', 220000]])
  for (const [d, v] of closing) assert.equal(v, balanceOn(checking, rows, '2026-08-01', d))
  // A card counts up as it's charged and down as it's paid.
  const card = acct(2, 'card', 0)
  const cardRows = [row('2026-11-01', 5000, { from_id: 2 }), row('2026-11-03', 2000, { from_id: 1, to_id: 2 })]
  assert.deepEqual([...closingBalances(card, cardRows, '2026-08-01')], [['2026-11-01', 5000], ['2026-11-03', 3000]])
})

test('statement: day headers carry the closing balance', () => {
  const typeOf = (t: Txn): CatType => (t.category_id === 1 ? 'Money in' : 'Spending')
  const o: FeedOptions = { byAmount: false, fold: false, showSched: false, exact: 0, today: '2026-11-20', typeOf, closing: new Map([['2026-11-12', 220000]]) }
  const heads = feedItems([row('2026-11-12', 500), row('2026-11-10', 300)], o).filter((i) => i.kind === 'head')
  assert.deepEqual(heads.map((h) => h.kind === 'head' && h.bal), [220000, undefined])
})

test('statement: amounts signed from the account side, toned as everywhere else', () => {
  const spend = row('2026-11-12', 4500, { from_id: 1 })
  assert.deepEqual(accountAmount('Spending', spend, 1), { cents: -4500, sign: 'always', tone: 'neutral', muted: false })
  const refund = row('2026-11-12', -1200, { from_id: 1 })
  assert.deepEqual(accountAmount('Spending', refund, 1), { cents: 1200, sign: 'always', tone: 'pos', muted: false })
  const pay = row('2026-11-12', 300000, { from_id: null, to_id: 1 })
  assert.deepEqual(accountAmount('Money in', pay, 1), { cents: 300000, sign: 'always', tone: 'pos', muted: false })
  // A transfer is out of one side and into the other, muted on both.
  const move = row('2026-11-12', 40000, { from_id: 1, to_id: 2 })
  assert.deepEqual(accountAmount('Transfer', move, 1), { cents: -40000, sign: 'always', tone: 'neutral', muted: true })
  assert.deepEqual(accountAmount('Transfer', move, 2), { cents: 40000, sign: 'always', tone: 'neutral', muted: true })
  assert.equal(accountAmount('Spending', spend, 9), undefined) // not this account's: the usual look
})

test('recently deleted: a search that finds nothing points to deleted matches', () => {
  const gone = [row('2026-11-12', 1549, { what: 'Netflix' }), row('2026-11-11', 900, { what: "Trader Joe's", note: 'snacks', tags: ['trip'] })]
  assert.deepEqual(deletedMatches(gone, 'netflix').map((r) => r.what), ['Netflix'])
  assert.deepEqual(deletedMatches(gone, 'trader joes trip').map((r) => r.what), ["Trader Joe's"])
  assert.deepEqual(deletedMatches(gone, 'groceries', () => ['Groceries']).length, 2)
  assert.deepEqual(deletedMatches(gone, 'netflix snacks'), [])
  assert.deepEqual(deletedMatches(gone, '  '), [])
})
