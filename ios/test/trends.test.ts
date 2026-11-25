// Insights' and Summary's numbers: full months, the same-day pace, the week, the highlight and month bars.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { averaged, byCategoryOn, complete, dayBars, highlight, locate, monthBars, pace, usualBy, weekDays } from '@/design/trends'
import { month } from './fixtures'

test('complete months leave out the month in progress and a partial first month', () => {
  const months = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']
  assert.deepEqual(complete({ start: '2026-06-01' }, months, '2026-11-25'), ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'])
  // The first month is all there is: it counts.
  assert.deepEqual(complete({ start: '2026-10-01' }, months, '2026-11-25'), ['2026-10-01'])
  // A ledger begun this month has no full month; the average then reads the month itself.
  assert.deepEqual(complete({ start: '2026-11-01' }, months, '2026-11-25'), [])
  assert.deepEqual(averaged({ start: '2026-11-01' }, months, '2026-11-25'), ['2026-11-01'])
  // Months before the ledger never count.
  assert.deepEqual(averaged({ start: '2026-09-01' }, months, '2026-11-25'), ['2026-10-01'])
})

test('rent on the 1st reads as the usual pace, not far ahead', () => {
  const entries = [
    { date: '2026-08-01', amount: 150000 }, { date: '2026-08-20', amount: 50000 },
    { date: '2026-09-01', amount: 150000 }, { date: '2026-09-20', amount: 70000 },
    { date: '2026-10-01', amount: 150000 }, { date: '2026-10-02', amount: 3000 }, { date: '2026-10-20', amount: 60000 },
  ]
  const usual = usualBy(entries, ['2026-08-01', '2026-09-01', '2026-10-01'], '2026-11-03')!
  assert.equal(usual.byNow, 151000)
  assert.equal(usual.whole, 211000)
  const p = pace(152000, usual, '2026-11-03')
  assert.equal(p.state, 'ok')
  assert.ok(p.outer > 0.7 && p.inner > 0.7)
  // Well past where earlier months were by today: ahead; past a whole usual month: over.
  assert.equal(pace(190000, usual, '2026-11-03').state, 'ahead')
  assert.equal(pace(220000, usual, '2026-11-03').state, 'over')
})

test('usual pace counts a short month whole on a later day, and every earlier month on the last day', () => {
  const entries = [{ date: '2026-02-28', amount: 1000 }, { date: '2026-01-31', amount: 500 }]
  assert.deepEqual(usualBy(entries, ['2026-01-01', '2026-02-01'], '2026-03-30'), { byNow: 500, whole: 750 })
  assert.deepEqual(usualBy(entries, ['2026-01-01'], '2026-04-30'), { byNow: 500, whole: 500 })
  assert.deepEqual(usualBy(entries, ['2026-01-01'], '2026-04-29'), { byNow: 0, whole: 500 })
})

test('without earlier months the rings fall back to the share of the month gone', () => {
  const p = pace(5000, null, '2026-11-15')
  assert.equal(p.usual, false)
  assert.equal(p.outer, 0)
  assert.equal(p.inner, 0.5)
  assert.equal(usualBy([], [], '2026-11-15'), null)
})

test('the week nets refunds, ignores scheduled days and splits by key', () => {
  const days = weekDays('2026-11-22', '2026-11-25', [
    { date: '2026-11-23', amount: 2000, key: 'a' }, { date: '2026-11-23', amount: -500, key: 'a' }, { date: '2026-11-23', amount: 1000, key: 'b' },
    { date: '2026-11-24', amount: -800, key: 'a' },
    { date: '2026-11-27', amount: 150000, key: 'c' },
  ])
  assert.equal(days.length, 7)
  assert.equal(days[1].total, 2500)
  assert.deepEqual(days[1].parts, [{ key: 'a', cents: 1500 }, { key: 'b', cents: 1000 }])
  assert.equal(days[2].total, -800)
  assert.deepEqual(days[2].parts, [])
  assert.equal(days[5].future, true)
  assert.equal(days[5].total, 0)
  assert.equal(days.reduce((n, d) => n + d.total, 0), 1700)
})

test('day bars leave scheduled days empty and net refunds within a day', () => {
  const bars = dayBars('2026-11-01', [{ date: '2026-11-02', amount: 1000 }, { date: '2026-11-02', amount: -300 }, { date: '2026-11-30', amount: 150000 }], '2026-11-25')
  assert.equal(bars.length, 30)
  assert.equal(bars[1].value, 700)
  assert.equal(bars[29].value, 0)
  assert.equal(bars[29].future, true)
})

test('month bars for everything are labeled when the ledger never crosses a January', () => {
  const rows = new Map([['2026-08-01', month('2026-08-01', { spent: 100 })]])
  const short = monthBars(rows, ['2026-08-01', '2026-09-01', '2026-10-01'], (m) => m.spent, 'All', '2026-10-01')
  assert.deepEqual(short.map((b) => b.label), ['A', 'S', 'O'])
  const months = Array.from({ length: 14 }, (_, i) => `${2025 + Math.floor((i + 5) / 12)}-${String(((i + 5) % 12) + 1).padStart(2, '0')}-01`)
  const long = monthBars(rows, months, (m) => m.spent, 'All', '2026-12-01')
  assert.equal(long[0].label, '2025')
  assert.equal(long.find((b) => b.key === '2026-01-01')?.label, '2026')
  assert.equal(long.filter((b) => b.label).length, 2)
})

test('the highlight compares full months only', () => {
  const rows = new Map(['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01'].map((m, i) => [m, month(m, { spent: [1000, 1000, 1500, 200][i] })]))
  const full = ['2026-08-01', '2026-09-01', '2026-10-01']
  const h = highlight(rows, full, (m) => m.spent, null)!
  assert.equal(h.month, '2026-10-01')
  assert.equal(h.diff, 50)
  // The month in progress, a future month or one before the ledger: nothing to say.
  assert.equal(highlight(rows, full, (m) => m.spent, '2026-11-01'), null)
  assert.equal(highlight(rows, full, (m) => m.spent, '2026-12-01'), null)
  assert.equal(highlight(rows, ['2026-10-01'], (m) => m.spent, null), null)
})

test('a month is found in the period that shows it', () => {
  assert.deepEqual(locate('2026-11-01', '2026-11-01', '6M', '2025-01-01'), { offset: 0, index: 5 })
  assert.deepEqual(locate('2026-11-01', '2026-06-01', '6M', '2025-01-01'), { offset: 0, index: 0 })
  assert.deepEqual(locate('2026-11-01', '2026-05-01', '6M', '2025-01-01'), { offset: -1, index: 5 })
  assert.deepEqual(locate('2026-11-01', '2025-03-01', 'Y', '2025-01-01'), { offset: -1, index: 2 })
  assert.deepEqual(locate('2026-11-01', '2025-03-01', 'All', '2025-01-01'), { offset: 0, index: 2 })
})

test('categories for one day', () => {
  const m = byCategoryOn([{ date: '2026-11-02', amount: 500, category_id: 3 }, { date: '2026-11-02', amount: 200, category_id: 3 }, { date: '2026-11-03', amount: 900, category_id: 3 }], '2026-11-02')
  assert.equal(m.get(3), 700)
})
