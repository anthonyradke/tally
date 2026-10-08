import { test } from 'node:test'
import assert from 'node:assert/strict'
import { place, topPlaces } from '@/lib/merchant'
import { boot, cat, month, row } from './fixtures.ts'

process.env.TZ = 'America/Denver'

const b = boot({ today: '2026-09-24', categories: [cat(1, 'Money in'), cat(2, 'Spending'), cat(3, 'Spending')],
  months: [month('2026-08-01'), month('2026-09-01'), month('2026-10-01')] })
const rows = [
  row('2026-08-03', 1200, { what: 'Chipotle', category_id: 2, from_id: 5 }),
  row('2026-09-10', 1500, { what: 'chipotle (lunch)', category_id: 2, from_id: 5 }),
  row('2026-09-12', 1800, { what: 'Chipotle', category_id: 3, from_id: 6 }),
  row('2026-09-30', 9999, { what: 'Chipotle', category_id: 2 }), // scheduled: not yet
  row('2026-09-11', 4000, { what: 'Target', category_id: 2 }),
]

test('place: totals, visits and the usual category and account', () => {
  const p = place(b, 'chipotle', rows)!
  assert.equal(p.name, 'Chipotle')
  assert.deepEqual([p.total, p.visits, p.average], [4500, 3, 1500])
  assert.deepEqual([p.first, p.last], ['2026-08-03', '2026-09-12'])
  assert.equal(p.categoryId, 2)
  assert.equal(p.accountId, 5)
  assert.deepEqual(p.months, [{ month: '2026-08-01', cents: 1200 }, { month: '2026-09-01', cents: 3300 }])
  assert.equal(place(b, 'nowhere', rows), null)
})

test('topPlaces: biggest first, scheduled rows left out', () => {
  assert.deepEqual(topPlaces(b, '2026-09-01', '2026-09-30', rows).map((x) => [x.key, x.cents, x.visits]), [['target', 4000, 1], ['chipotle', 3300, 2]])
})
