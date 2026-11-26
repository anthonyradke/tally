// Summary's month chart: this month against last month, added up day by day, and how it's worded.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareA11y, compareLine, compareOn, monthCompare, ordinal } from '@/design/trends'
import { curve, lineScale } from '@/design/ui/curve'

test('running totals by day: posted only, refunds netted, last month whole', () => {
  const c = monthCompare([
    { date: '2026-10-01', amount: 150000 }, { date: '2026-10-31', amount: 2000 },
    { date: '2026-11-01', amount: 150000 }, { date: '2026-11-03', amount: 5000 }, { date: '2026-11-03', amount: -1000 },
    { date: '2026-11-20', amount: 9999 }, // scheduled, after today
    { date: '2026-09-30', amount: 777 }, // before last month
  ], '2026-11-04', '2026-01-01')
  assert.equal(c.month, '2026-11-01')
  assert.equal(c.prevMonth, '2026-10-01')
  assert.equal(c.days, 31)
  assert.deepEqual(c.cur, [150000, 150000, 154000, 154000])
  assert.equal(c.prev!.length, 31)
  assert.equal(c.prev![0], 150000)
  assert.equal(c.prev![30], 152000)
  assert.deepEqual(compareOn(c, 3), { cur: 154000, prev: 150000 })
  assert.deepEqual(compareOn(c, 31), { cur: null, prev: 152000 })
})

test('edges: the 1st, a long month after a short one, no last month, refunds below zero, January', () => {
  const first = monthCompare([{ date: '2026-11-01', amount: 1200 }], '2026-11-01', '2026-01-01')
  assert.deepEqual(first.cur, [1200])
  // March after February: 31 slots, February's total reads for the 29th to the 31st.
  const mar = monthCompare([{ date: '2026-02-28', amount: 500 }], '2026-03-31', '2026-01-01')
  assert.equal(mar.days, 31)
  assert.equal(mar.prev!.length, 28)
  assert.deepEqual(compareOn(mar, 30), { cur: 0, prev: 500 })
  // A ledger begun this month has nothing to compare.
  const fresh = monthCompare([{ date: '2026-11-02', amount: 100 }], '2026-11-05', '2026-11-01')
  assert.equal(fresh.prev, null)
  assert.deepEqual(compareOn(fresh, 2), { cur: 100, prev: null })
  // A refund larger than the day's spending takes the running total under zero.
  const neg = monthCompare([{ date: '2026-11-01', amount: -4000 }, { date: '2026-11-02', amount: 1000 }], '2026-11-02', '2026-01-01')
  assert.deepEqual(neg.cur, [-4000, -3000])
  assert.equal(monthCompare([], '2027-01-10', '2026-01-01').prevMonth, '2026-12-01')
  // Nothing at all: flat zeros, still one value a day.
  assert.deepEqual(monthCompare([], '2026-11-03', '2026-01-01').cur, [0, 0, 0])
})

test('words: less, more, same, nothing yet, nothing to compare', () => {
  assert.equal(compareLine(124000, 141000, null), '$170 less than last month by today')
  assert.equal(compareLine(98000, 92000, 12), '$60 more than last month by the 12th')
  assert.equal(compareLine(1000040, 1000000, 3), 'Same as last month by the 3rd')
  assert.equal(compareLine(0, 0, null), 'Nothing spent yet')
  assert.equal(compareLine(0, 0, 2), 'Nothing spent by the 2nd')
  assert.equal(compareLine(5000, null, null), 'Nothing to compare yet')
  assert.equal(compareLine(-3000, 2000, 1), '$50 less than last month by the 1st')
  assert.equal(compareLine(312345600, 100, null), '$3,123,455 more than last month by today')
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31, 111].map(ordinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st', '111th'])
  assert.equal(compareA11y(124000, 141000, null), 'Spent $1,240 this month, $170 less than last month by today')
  assert.equal(compareA11y(98000, 92000, 12, 'November 12'), 'November 12, spent $980, $60 more than last month by the 12th')
  assert.equal(compareA11y(5000, null, null), 'Spent $50 this month')
  assert.equal(compareA11y(-4000, 0, 1, 'November 1'), 'November 1, spent −$40, $40 less than last month by the 1st')
})

test('the scale: a round top, zero at the bottom unless refunds take a line below it', () => {
  const s = lineScale([0, 120000, 141000], 150)
  assert.equal(s.hi, 200000)
  assert.equal(s.lo, 0)
  assert.deepEqual(s.grid.map((g) => g.label), ['$2k', '$1k', '0'])
  assert.equal(s.y(0), 150)
  assert.equal(s.y(200000), 0)
  const n = lineScale([-4000, 1000], 100)
  assert.equal(n.lo, -4000)
  assert.ok(n.y(0) < 100 && n.y(-4000) === 100)
  // All zeros: a $100 top, the line along the baseline.
  const z = lineScale([0, 0], 100)
  assert.equal(z.hi, 10000)
  assert.equal(z.y(0), 100)
})

test('the curve passes through every point and never overshoots a flat stretch', () => {
  const xs = [0, 10, 20, 30, 40], ys = [100, 100, 50, 50, 50]
  const d = curve(xs, ys)
  assert.match(d, /^M0\.0,100\.0/)
  for (let i = 1; i < xs.length; i++) assert.ok(d.includes(`${xs[i].toFixed(1)},${ys[i].toFixed(1)}`))
  // Every control point stays within its segment's y range (no bump above 100 or below 50).
  const nums = [...d.matchAll(/(-?\d+\.\d),(-?\d+\.\d)/g)].map((m) => Number(m[2]))
  assert.ok(nums.every((y) => y >= 50 && y <= 100))
  assert.equal(curve([5], [7]), 'M5.0,7.0')
  assert.equal(curve([], []), '')
})
