import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aheadLine, outlook, outlooks, sharedSpan } from '@/lib/forecast'
import { acct, boot, row } from './fixtures.ts'

process.env.TZ = 'America/Denver'

test('outlook: scheduled rows move the balance ahead, and the low point is found', () => {
  const a = acct(1, 'cash', 100000)
  const rows = [
    row('2026-09-01', 20000),                                   // past: $1,000 - $200 = $800 today
    row('2026-09-30', 90000),                                   // rent takes it to -$100
    row('2026-10-03', 250000, { from_id: null, to_id: 1 }),     // paycheck
    row('2026-11-20', 5000),                                    // past the window
  ]
  const o = outlook(a, rows, '2026-08-01', '2026-09-24')
  assert.equal(o.now, 80000)
  assert.equal(o.worst, -10000)
  assert.equal(o.worstOn, '2026-09-30')
  assert.equal(o.belowZero, '2026-09-30')
  assert.equal(o.end, 240000)
  assert.deepEqual([o.inflow, o.outflow, o.count], [250000, 90000, 2])
  assert.equal(o.days.length, 31)
})

test('outlook: for a card the worst point is the most owed', () => {
  const card = acct(2, 'card', 0)
  const rows = [row('2026-09-26', 3000, { from_id: 2 }), row('2026-09-28', 3000, { from_id: null, to_id: 2 })]
  const o = outlook(card, rows, '2026-08-01', '2026-09-24')
  assert.equal(o.worst, 3000)
  assert.equal(o.worstOn, '2026-09-26')
  assert.equal(o.belowZero, null)
})

test('outlooks: only accounts with something scheduled, cash first', () => {
  const b = boot({ accounts: [acct(2, 'card'), acct(1, 'cash', 1000), acct(3, 'cash', 5), acct(4, 'loan', 9)] })
  const rows = [row('2026-09-30', 100, { from_id: 2 }), row('2026-10-01', 100, { from_id: 1 })]
  assert.deepEqual(outlooks(b, rows).map((o) => o.a.id), [1, 2])
})

test('sharedSpan: one scale, the biggest swing', () => {
  assert.equal(sharedSpan([{ days: [500000, 360000, 360000] }, { days: [4800, 6000] }]), 140000)
  assert.equal(sharedSpan([{ days: [5, 5] }]), 1)
})

test('aheadLine: cards speak in what is owed', () => {
  const base = { inflow: 0, outflow: 1200, count: 1, belowZero: null }
  assert.equal(aheadLine({ ...base, a: acct(2, 'card') }), '1 scheduled, +$12 owed')
  assert.equal(aheadLine({ ...base, inflow: 5000, count: 2, a: acct(2, 'card') }), '2 scheduled, −$38 owed')
  assert.equal(aheadLine({ ...base, a: acct(1, 'cash') }), '1 scheduled, −$12')
  assert.equal(aheadLine({ ...base, belowZero: '2026-09-30', a: acct(1, 'cash') }), 'Below zero on Sep 30')
})
