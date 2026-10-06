import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Recurring } from '@/lib/api'
import { extraFor, monthlyPayment, project, span } from '@/lib/loans'
import { acct, boot, month, row } from './fixtures.ts'

process.env.TZ = 'America/Denver'

const plan = (x: Partial<Recurring>): Recurring => ({ id: 1, label: 'Car', category_id: 5, from_account_id: 1, to_account_id: 9, amount: 40000,
  what: '', freq: 'monthly', next_date: '2026-10-15', horizon_days: 45, active: 1, anchor_day: 15, created_at: '', ...x })

test('project: the engine rule run forward, interest and payoff month', () => {
  // $1,000 at 12% (1% a month) paying $500: 1010 - 500 = 510, 515.10 - 500 = 15.10, 15.25 - 500 -> 0.
  const p = project(100000, 0.12, 50000, '2026-10-01')!
  assert.equal(p.months, 3)
  assert.equal(p.interest, 1000 + 510 + 15)
  assert.equal(p.payoff, '2027-01-01')
  assert.deepEqual(project(0, 0.12, 50000, '2026-10-01'), { months: 0, interest: 0, payoff: '2026-10-01' })
  assert.equal(project(120000, null, 10000, '2026-12-01')!.payoff, '2027-12-01') // no rate: 12 even payments
})

test('project: never, when interest is at least the payment', () => {
  assert.equal(project(1000000, 0.12, 10000, '2026-10-01'), null)
  assert.equal(project(1000000, 0.12, 0, '2026-10-01'), null)
})

test('monthlyPayment: recurring first, then the average of finished months, then this month', () => {
  const loan = acct(9, 'loan', 1000000, { loan_rate: 0.06 })
  const months = [month('2026-08-01'), month('2026-09-01'), month('2026-10-01')]
  const pays = [row('2026-08-20', 30000, { to_id: 9 }), row('2026-09-20', 50000, { to_id: 9 }), row('2026-09-02', 999, { to_id: 1 })]
  const today = '2026-10-06'
  assert.deepEqual(monthlyPayment(boot({ today, months, recurring: [plan({ freq: 'biweekly', amount: 12000 })] }), loan, pays),
    { cents: 26000, from: 'recurring' })
  assert.deepEqual(monthlyPayment(boot({ today, months }), loan, pays), { cents: 40000, from: 'average', months: 2 })
  // Opened this month: no finished months, so this month's payment so far.
  const fresh = { ...loan, opened: '2026-10-01' }
  assert.deepEqual(monthlyPayment(boot({ today, months }), fresh, [...pays, row('2026-10-03', 41000, { to_id: 9 })]), { cents: 41000, from: 'month' })
  assert.equal(monthlyPayment(boot({ today, months }), fresh, pays), null)
  // A paused plan doesn't count; a future-dated payment isn't paid yet.
  assert.equal(monthlyPayment(boot({ today, months, recurring: [plan({ active: 0 })] }), fresh, [row('2026-10-20', 5000, { to_id: 9 })]), null)
})

test('span and extraFor', () => {
  assert.equal(span(53), '4 years 5 months')
  assert.equal(span(12), '1 year')
  assert.equal(span(1), '1 month')
  assert.equal(extraFor(15000), 2500)
  assert.equal(extraFor(41000), 5000)
  assert.equal(extraFor(90000), 10000)
})
