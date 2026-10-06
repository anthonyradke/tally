import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Recurring } from '@/lib/api'
import { findRepeats } from '@/lib/repeats'
import { row } from './fixtures.ts'

process.env.TZ = 'America/Denver'

const today = '2026-10-06'

test('a monthly subscription at the same price is offered with its next date', () => {
  const rows = [row('2026-08-15', 1199, { what: 'Spotify' }), row('2026-09-15', 1199, { what: 'Spotify' })]
  const [r] = findRepeats(rows, [], today)
  assert.deepEqual({ what: r.what, freq: r.freq, next: r.next, amount: r.amount }, { what: 'Spotify', freq: 'monthly', next: '2026-10-15', amount: 1199 })
})

test('a paycheck every two weeks needs three in a row', () => {
  const pay = (d: string) => row(d, 210000, { what: 'Paycheck', category_id: 1, from_id: null, to_id: 1 })
  assert.equal(findRepeats([pay('2026-09-11'), pay('2026-09-25')], [], today).length, 0)
  const [r] = findRepeats([pay('2026-08-28'), pay('2026-09-11'), pay('2026-09-25')], [], today)
  assert.equal(r.freq, 'biweekly')
  assert.equal(r.next, '2026-10-09')
})

test('groceries, stopped subscriptions and planned ones are left out', () => {
  const groceries = [row('2026-08-03', 8412, { what: 'Safeway' }), row('2026-09-02', 6120, { what: 'Safeway' })] // amounts differ
  const stopped = [row('2026-06-01', 999, { what: 'Hulu' }), row('2026-07-01', 999, { what: 'Hulu' })] // next was Aug 1
  const planned = [row('2026-08-01', 150000, { what: 'Rent' }), row('2026-09-01', 150000, { what: 'Rent' })]
  const rent = { id: 1, label: 'Rent', what: 'Rent', category_id: 2, active: 1 } as Recurring
  assert.deepEqual(findRepeats([...stopped, ...groceries, ...planned], [rent], today), [])
})

test('the 31st steps to the end of a short month', () => {
  const rows = [row('2026-07-31', 500, { what: 'Gym' }), row('2026-08-31', 500, { what: 'Gym' })]
  assert.equal(findRepeats(rows, [], '2026-09-10')[0].next, '2026-09-30')
})
