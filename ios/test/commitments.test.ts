import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Recurring } from '@/lib/api'
import { commitments } from '@/lib/commitments'
import { boot, cat } from './fixtures.ts'

const r = (id: number, category_id: number, amount: number, freq: Recurring['freq'], active = 1): Recurring => ({ id, label: `R${id}`, category_id, from_account_id: 1,
  to_account_id: null, amount, what: '', freq, next_date: '2026-10-15', horizon_days: 45, active, anchor_day: 15, created_at: '' })

test('commitments: monthly figures, out and in, transfers and paused ones left out', () => {
  const b = boot({ categories: [cat(1, 'Money in'), cat(2, 'Spending'), cat(3, 'Transfer')],
    recurring: [r(1, 2, 1200, 'yearly'), r(2, 2, 5700, 'monthly'), r(3, 1, 100000, 'biweekly'), r(4, 3, 5000, 'monthly'), r(5, 2, 999, 'monthly', 0)] })
  const c = commitments(b)
  assert.deepEqual(c.out.map((x) => [x.r.id, x.monthly]), [[2, 5700], [1, 100]])
  assert.equal(c.outMonthly, 5800)
  assert.deepEqual([c.in[0].monthly, c.inMonthly], [216667, 216667])
})
