import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Recurring } from '@/lib/api'
import { billKeys, findRepeats } from '@/lib/repeats'
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

test('billKeys: monthly rhythms, from the same groups findRepeats reads', () => {
  const at = (what: string, dates: string[], amounts: number[], x = {}) => dates.map((d, i) => row(d, amounts[i], { what, ...x }))
  const rows = [
    ...at('Netflix', ['2026-07-03', '2026-08-03'], [1549, 1549]),                                   // two alike: a repeat, so a bill
    ...at('Xcel Energy', ['2026-07-12', '2026-08-12', '2026-09-12'], [7012, 12500, 9350], { category_id: 3 }), // three, season-varied
    ...at('Costco', ['2026-07-02', '2026-08-01', '2026-09-03'], [4000, 21000, 9000]),               // monthly, but 5x apart
    ...at('Gym', ['2026-08-02', '2026-09-02'], [3000, 4500]),                                       // two, not alike
    ...at('Sweetgreen', ['2026-08-28', '2026-09-12', '2026-10-16'], [1154, 1360, 1375]),            // alike a month apart, but twice in September
    ...at('Coffee', ['2026-09-01', '2026-09-08', '2026-09-15'], [575, 575, 575]),                   // weekly: everyday
    ...at('Hulu', ['2026-01-05', '2026-02-05'], [999, 999]),                                        // stopped long ago, still a bill then
    ...at('Rent', ['2026-08-01', '2026-09-01'], [140000, 140000], { recurring_id: 1 }),           // a template's: billTest knows it already
  ]
  assert.deepEqual([...billKeys(rows, today)].sort(), ['2|hulu', '2|netflix', '3|xcel energy'])
})
