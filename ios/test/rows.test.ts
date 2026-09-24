import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CatType } from '@/lib/api'
import { dailyBalances, groupTotal, split } from '@/lib/balances'
import { extraCount, fromViewQuery, toQuery, viewQuery, type Filters } from '@/lib/filters'
import { fits, SHAPES } from '@/lib/shapes'
import { groupByDay, rowAmount } from '@/lib/txn'
import { acct, boot, row } from './fixtures.ts'

process.env.TZ = 'America/Denver'
const TYPES: CatType[] = ['Money in', 'Spending', 'Transfer', 'Saving', 'Loan']

test('dailyBalances: cash counts To up and From down, cards the other way', () => {
  const cash = acct(1, 'cash', 10000), card = acct(3, 'card', 500)
  const rows = [row('2026-08-31', 999, { from_id: 1 }), row('2026-09-01', 2500, { from_id: 1, to_id: 3 }),
    row('2026-09-01', 1000, { from_id: 3 }), row('2026-09-03', 4000, { from_id: null, to_id: 1 }), row('2026-09-05', 1, { from_id: 1 })]
  const c = dailyBalances(cash, rows, '2026-09-01', '2026-09-04')
  assert.deepEqual(c.dates, ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'])
  assert.deepEqual(c.values, [7500, 7500, 11500, 11500]) // before-start and after-end rows left out
  assert.deepEqual(dailyBalances(card, rows, '2026-09-01', '2026-09-01').values, [500 - 2500 + 1000])
})

test('dailyBalances crosses DST without skipping or repeating a day', () => {
  const s = dailyBalances(acct(1, 'cash'), [], '2026-10-30', '2026-11-03')
  assert.deepEqual(s.dates, ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'])
  assert.equal(dailyBalances(acct(1, 'cash'), [], '2026-03-01', '2026-03-31').dates.length, 31)
})

test('split: cards and loans are debts', () => {
  const b = boot({ accounts: [acct(1, 'cash'), acct(2, 'investment'), acct(3, 'card'), acct(4, 'loan')] })
  const bal = new Map([[1, 1000], [2, 5000], [3, 300], [4, 2000]])
  assert.deepEqual(split(b, bal), { assets: 6000, debts: 2300, net: 3700 })
})

test('fits mirrors the server rules for every type and From/To combination', () => {
  const want: Record<CatType, (f: number | null, t: number | null) => boolean> = {
    'Money in': (f, t) => !f && !!t, 'Spending': (f, t) => !!f && !t, 'Transfer': (f, t) => !!f && !!t,
    'Saving': (f) => !!f, 'Loan': (f) => !!f,
  }
  for (const ty of TYPES) for (const f of [null, 1, 2]) for (const t of [null, 1, 2]) {
    assert.equal(fits({ from_id: f, to_id: t }, ty), want[ty](f, t) && !(f && f === t), `${ty} ${f} ${t}`)
  }
  assert.deepEqual(Object.keys(SHAPES).sort(), [...TYPES].sort())
})

test('rowAmount: statement convention', () => {
  assert.deepEqual(rowAmount('Spending', 1250), { cents: 1250, sign: 'never', tone: 'neutral', muted: false })
  assert.deepEqual(rowAmount('Spending', -1250), { cents: 1250, sign: 'always', tone: 'pos', muted: false })
  assert.deepEqual(rowAmount('Money in', 5000), { cents: 5000, sign: 'always', tone: 'pos', muted: false })
  assert.deepEqual(rowAmount('Money in', -5000), { cents: -5000, sign: 'always', tone: 'neg', muted: false })
  for (const ty of ['Transfer', 'Saving', 'Loan'] as CatType[]) assert.deepEqual(rowAmount(ty, -700), { cents: 700, sign: 'never', tone: 'neutral', muted: true })
})

test('groupByDay: newest first, spending net of refunds per day', () => {
  const rows = [row('2026-09-24', 1000), row('2026-09-24', -300), row('2026-09-24', 99999, { category_id: 1 }), row('2026-09-23', 50)]
  const g = groupByDay(rows, (t) => (t.category_id === 1 ? 'Money in' : 'Spending'))
  assert.deepEqual(g.map((x) => [x.date, x.items.length, x.spent]), [['2026-09-24', 3, 700], ['2026-09-23', 1, 50]])
})

test('filters: badge count and the query sent to the server', () => {
  const f: Filters = { q: 'cafe', type: 'Spending', sort: 'date', dir: 'desc' }
  assert.equal(extraCount(f), 0)
  assert.equal(extraCount({ ...f, category: 3, start: '2026-09-01', end: '2026-09-30', sort: 'amount' }), 3)
  assert.deepEqual(toQuery({ ...f, q: '', type: '' }), { q: undefined, type: undefined, category: undefined, account: undefined,
    start: undefined, end: undefined, tag: undefined, group: undefined, sort: 'date', dir: 'desc' })
})

test('a saved view brings back the filters it saved', () => {
  const f: Filters = { q: 'café & co', type: 'Spending', category: 3, account: 1, start: '2026-09-01', end: '2026-09-30',
    tag: 'trip', group: 'abc123def456', sort: 'amount', dir: 'asc' }
  assert.deepEqual(fromViewQuery(viewQuery(f)), f)
  const plain: Filters = { q: '', type: '', sort: 'date', dir: 'desc' }
  assert.deepEqual(fromViewQuery(viewQuery(plain)), { ...plain, category: undefined, account: undefined, start: undefined, end: undefined, tag: undefined, group: undefined })
})

test('a card or loan paid past zero reads as a credit, not negative owed', () => {
  assert.equal(groupTotal(68800, 'card'), '$688.00 owed')
  assert.equal(groupTotal(-688, 'card'), '$6.88 credit')
  assert.equal(groupTotal(-688, 'cash'), '−$6.88')
  assert.equal(groupTotal(1373603, 'loan'), '$13,736.03 owed')
})
