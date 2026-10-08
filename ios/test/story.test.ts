import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildStory, dayName } from '@/lib/story'
import { boot, cat, month, row } from './fixtures.ts'

process.env.TZ = 'America/Denver'

const b = boot({
  today: '2026-10-03',
  categories: [cat(1, 'Money in'), cat(2, 'Spending', { budget: 50000 }), cat(3, 'Spending', { budget: 1000 }), cat(4, 'Transfer')],
  months: [
    month('2026-08-01', { spent: 30000, by_category: { 2: 20000, 3: 10000 }, net_worth: 100000 }),
    month('2026-09-01', { money_in: 200000, spent: 46000, left_over: 154000, by_category: { 2: 40000, 3: 6000, 1: 200000 }, net_worth: 250000 }),
    month('2026-10-01'),
  ],
})
const rows = [
  row('2026-09-02', 1500, { what: 'Chipotle', category_id: 2 }),
  row('2026-09-02', 30000, { what: 'Rent', category_id: 2 }),
  row('2026-09-10', 1200, { what: 'chipotle', category_id: 2 }),
  row('2026-09-12', 6000, { what: 'Movies', category_id: 3 }),
  row('2026-09-15', 7300, { what: 'Market', category_id: 2 }),
  row('2026-09-30', 200000, { what: 'Pay', category_id: 1, from_id: null, to_id: 1 }),
  row('2026-08-30', 999, { category_id: 2 }),
]

test('buildStory: totals, top categories, biggest day and favorite place', () => {
  const s = buildStory(b, '2026-09-01', rows)!
  assert.equal(s.entries, 6)
  assert.equal(s.kept, 0.77)
  assert.deepEqual(s.top.map((x) => [x.c.id, x.cents]), [[2, 40000], [3, 6000]])
  assert.equal(s.biggestDay?.date, '2026-09-02')
  assert.equal(s.biggestDay?.cents, 31500)
  assert.equal(s.biggest?.what, 'Rent')
  assert.deepEqual(s.favorite, { what: 'Chipotle', visits: 2, cents: 2700 })
  assert.deepEqual([s.quiet.days, s.quiet.of, s.quiet.streak], [26, 30, 15])
  assert.equal(s.movers.up?.c.id, 2)
  assert.equal(s.movers.up?.by, 20000)
  assert.equal(s.movers.down?.c.id, 3)
  assert.deepEqual(s.worth, { change: 150000, values: [100000, 250000] })
  assert.deepEqual(s.budgets, { kept: 1, of: 2 })
})

test('buildStory: a month still going counts quiet days only up to today', () => {
  const s = buildStory(b, '2026-10-01', rows)!
  assert.deepEqual([s.quiet.days, s.quiet.of], [3, 3])
  assert.equal(s.favorite, null)
  assert.equal(buildStory(b, '2025-01-01', rows), null)
})

test('dayName', () => {
  assert.equal(dayName('2026-09-02'), 'Wednesday the 2nd')
  assert.equal(dayName('2026-09-11'), 'Friday the 11th')
  assert.equal(dayName('2026-09-23'), 'Wednesday the 23rd')
})
