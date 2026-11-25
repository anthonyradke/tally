// What the tabs read from the ledger: this month, load states, signs on one account's list, search lines, visits.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError } from '@/lib/api'
import { byDay, loadOf, lookupsFor, pastMonths, searchLine, signFrom, thisMonth, updatedLabel, visits } from '@/design/ledger'
import { acct, boot, month, row } from './fixtures'

test('this month is the month containing today, never the last in the list', () => {
  const b = boot({ months: [month('2026-10-01'), month('2026-11-01'), month('2026-12-01')] })
  assert.equal(thisMonth(b, '2026-11-25')?.month, '2026-11-01')
  // A bootstrap kept from the 30th has no row for the 1st: none, not the month before or a scheduled one after.
  assert.equal(thisMonth(boot({ months: [month('2026-10-01'), month('2026-11-01')] }), '2026-12-01'), undefined)
  assert.equal(thisMonth(boot({ months: [month('2026-12-01'), month('2027-01-01')] }), '2026-11-30'), undefined)
  assert.deepEqual(pastMonths(b, '2026-11-25').map((m) => m.month), ['2026-10-01', '2026-11-01'])
})

test('lookups are built once per bootstrap', () => {
  const b = boot()
  assert.equal(lookupsFor(b), lookupsFor(b))
  assert.equal(lookupsFor(b).acct.get(1)?.kind, 'cash')
  assert.equal(lookupsFor(undefined).acct.size, 0)
})

test('one account signs its rows like its statement', () => {
  const cash = acct(1, 'cash'), card = acct(2, 'card'), loan = acct(3, 'loan')
  // Rent from checking: − on checking.
  assert.deepEqual(signFrom(row('2026-11-01', 150000, { from_id: 1 }), cash), { cents: -150000, plus: false, tone: 'plain' })
  // Pay into checking: green +.
  assert.deepEqual(signFrom(row('2026-11-01', 300000, { from_id: null, to_id: 1 }), cash), { cents: 300000, plus: true, tone: 'pos' })
  // A charge on the card: plain; the payment from checking to the card: − on checking, green + on the card.
  assert.deepEqual(signFrom(row('2026-11-02', 4500, { from_id: 2 }), card), { cents: 4500, plus: false, tone: 'plain' })
  const pay = row('2026-11-03', 80000, { from_id: 1, to_id: 2 })
  assert.deepEqual(signFrom(pay, cash), { cents: -80000, plus: false, tone: 'plain' })
  assert.deepEqual(signFrom(pay, card), { cents: 80000, plus: true, tone: 'pos' })
  // A refund on the card (spending with a negative amount): a green + credit.
  assert.deepEqual(signFrom(row('2026-11-04', -2000, { from_id: 2 }), card), { cents: 2000, plus: true, tone: 'pos' })
  // A loan payment: a credit on the loan.
  assert.deepEqual(signFrom(row('2026-11-05', 40000, { from_id: 1, to_id: 3 }), loan), { cents: 40000, plus: true, tone: 'pos' })
})

test('load states', () => {
  const off = new TypeError('Network request failed')
  const refused = new ApiError(401, ['Tally wants its token.'])
  assert.deepEqual(loadOf({ data: undefined, error: null }), { kind: 'loading', note: null })
  assert.deepEqual(loadOf({ data: undefined, error: refused }), { kind: 'locked', note: null })
  assert.deepEqual(loadOf({ data: undefined, error: new ApiError(403, ['x']) }), { kind: 'locked', note: null })
  assert.deepEqual(loadOf({ data: undefined, error: off }), { kind: 'offline', note: null })
  assert.deepEqual(loadOf({ data: undefined, error: new ApiError(500, ['boom']) }), { kind: 'failed', note: null })
  // With data kept on the phone, never blocked: a note instead.
  assert.deepEqual(loadOf({ data: {}, error: off }), { kind: 'ready', note: 'offline' })
  assert.deepEqual(loadOf({ data: {}, error: refused }), { kind: 'ready', note: 'locked' })
  assert.deepEqual(loadOf({ data: {}, error: null }), { kind: 'ready', note: null })
})

test('updated label', () => {
  const now = new Date(2026, 10, 25, 15, 0).getTime()
  assert.equal(updatedLabel(new Date(2026, 10, 25, 9, 41).getTime(), now), 'Updated 9:41 AM')
  assert.equal(updatedLabel(new Date(2026, 10, 24, 9, 41).getTime(), now), 'Updated Yesterday')
  assert.equal(updatedLabel(0, now), '')
})

test('search line sums by type', () => {
  const page = { total: 3, by_type: { Spending: 5000, 'Money in': 200000 } }
  assert.equal(searchLine(page, 'all'), '3 results · $50 spent · $2,000 in')
  assert.equal(searchLine({ total: 1, by_type: { Transfer: -80000 } }, 'all'), '1 result · $800 moved')
  assert.equal(searchLine(page, 'Spending'), '3 results · $50 spent')
  assert.equal(searchLine({ total: 0, by_type: {} }, 'all'), null)
})

test('rows group by day even when exact matches come first', () => {
  const a = row('2026-11-03', 1250), b = row('2026-11-05', 900), c = row('2026-11-03', 400)
  const days = byDay([a, b, c, a], () => true)
  assert.deepEqual(days.map((d) => d.date), ['2026-11-03', '2026-11-05'])
  assert.equal(days[0].data.length, 2)
  assert.equal(days[0].spent, 1650)
})

test('visits count the server total and leave refunds out', () => {
  const items = [row('2026-11-03', 500, { what: 'Blue Bottle' }), row('2026-11-01', -500, { what: 'Blue Bottle' }), row('2026-10-01', 700, { what: 'blue bottle' })]
  // The server filtered by the name: its total and sum stand.
  assert.deepEqual(visits({ total: 40, items, by_type: { Spending: 18000 } }, 'Blue Bottle', 'Spending').count, 39)
  assert.equal(visits({ total: 40, items, by_type: { Spending: 18000 } }, 'Blue Bottle', 'Spending').sum, 18000)
  // An older server ignored the name: only exact matches loaded count.
  const mixed = [...items, row('2026-11-02', 900, { what: 'Blue Bottle Kyoto' })]
  const v = visits({ total: 900, items: mixed, by_type: { Spending: 99999 } }, 'Blue Bottle', 'Spending')
  assert.equal(v.count, 2)
  assert.equal(v.sum, 700)
  assert.equal(visits(undefined, 'x', 'Spending').count, 0)
})
