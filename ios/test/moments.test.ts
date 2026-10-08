import { test } from 'node:test'
import assert from 'node:assert/strict'
import { milestone, paydays } from '@/lib/moments'
import { boot, cat, row } from './fixtures.ts'

test('paydays: today, money in, big enough, not seen', () => {
  const b = boot({ today: '2026-10-08', categories: [cat(1, 'Money in'), cat(2, 'Spending')] })
  const rows = [row('2026-10-08', 250000, { category_id: 1 }), row('2026-10-08', 5000, { category_id: 1 }), row('2026-10-07', 250000, { category_id: 1 }), row('2026-10-08', 90000, { category_id: 2 })]
  assert.deepEqual(paydays(b, rows, []).map((t) => t.amount), [250000])
  assert.deepEqual(paydays(b, rows, [rows[0].id]), [])
})

test('milestone: the round number passed on the way up', () => {
  assert.equal(milestone(480000, 520000), 500000)
  assert.equal(milestone(-30000, 10000), 0)
  assert.equal(milestone(-3500000, -3400000), null) // still under the next one up (−$30k)
  assert.equal(milestone(-3500000, -2900000), -3000000)
  assert.equal(milestone(520000, 480000), null)
  assert.equal(milestone(null, 999999), null)
})
