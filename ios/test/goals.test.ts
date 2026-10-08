import { test } from 'node:test'
import assert from 'node:assert/strict'
import { efPace } from '@/lib/goals'
import { acct, boot, month } from './fixtures.ts'

process.env.TZ = 'America/Denver'

test('efPace: the recent pace of the emergency fund accounts, and when it gets there', () => {
  const b = boot({
    today: '2026-10-08', accounts: [acct(1, 'cash', 0, { ef: true }), acct(2, 'cash')], ef: { goal: 1000000, progress: 400000 },
    months: [month('2026-08-01', { balances: { 1: 200000, 2: 5 } }), month('2026-09-01', { balances: { 1: 300000, 2: 9 } }), month('2026-10-01', { balances: { 1: 400000 } })],
  })
  assert.deepEqual(efPace(b), { perMonth: 100000, months: 6, eta: '2027-04-01' })
  assert.equal(efPace({ ...b, ef: { goal: 1000000, progress: 1000000 } }), null) // already there
  assert.equal(efPace({ ...b, months: b.months.slice(1) }), null) // one finished month: no pace yet
})
