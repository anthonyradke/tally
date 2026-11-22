import { test } from 'node:test'
import assert from 'node:assert/strict'
import { billTest, budgetFor, budgetLine, elapsed, monthBudget, paceOver, paidBill, suggestBudgets } from '@/lib/budgets'
import { monthsBefore, typicalFrom } from '@/lib/typical'
import { monthsNow } from '@/lib/months'
import { paceFrom, paceWindow } from '@/lib/pace'
import { boot, cat, month, row } from './fixtures.ts'

process.env.TZ = 'America/Denver'

test('monthsNow: the month containing today, not the last row', () => {
  const b = boot({ months: [month('2026-08-01'), month('2026-09-01'), month('2026-10-01'), month('2026-11-01')] })
  const { cur, prev, upTo } = monthsNow(b)
  assert.equal(cur.month, '2026-09-01')
  assert.equal(prev?.month, '2026-08-01')
  assert.deepEqual(upTo.map((m) => m.month), ['2026-08-01', '2026-09-01'])
})

test('monthsNow at local midnight on the 1st', () => {
  const months = [month('2026-09-01'), month('2026-10-01')]
  assert.equal(monthsNow(boot({ today: '2026-09-30', months })).cur.month, '2026-09-01')
  assert.equal(monthsNow(boot({ today: '2026-10-01', months })).cur.month, '2026-10-01')
  assert.equal(monthsNow(boot({ today: '2026-10-01', months })).prev?.month, '2026-09-01')
})

test('budgetFor: a month override wins over the default, null means none', () => {
  const c = cat(2, 'Spending', { budget: 40000 })
  const b = boot({ categories: [c], budgets: [{ category_id: 2, month: '2026-09-01', amount: 30000 }] })
  assert.equal(budgetFor(b, c, '2026-09-01'), 30000)
  assert.equal(budgetFor(b, c, '2026-10-01'), 40000)
  assert.equal(budgetFor(b, cat(3, 'Spending'), '2026-09-01'), null)
})

test('elapsed and paceOver', () => {
  assert.equal(elapsed('2026-08-01', '2026-09-24'), 1)
  assert.equal(elapsed('2026-10-01', '2026-09-24'), 0)
  assert.equal(elapsed('2026-09-01', '2026-09-15'), 0.5)
  assert.equal(elapsed('2028-02-01', '2028-02-29'), 1)
  const groceries = { by: 10000, full: 20000 } // half of it usually by mid-month
  assert.equal(paceOver(10000, 20000, '2026-09-01', '2026-09-03', groceries), null)  // too early to call
  assert.equal(paceOver(15000, 20000, '2026-09-01', '2026-09-15', groceries), 5000) // 150 so far, 100 more usually to come
  assert.equal(paceOver(9000, 20000, '2026-09-01', '2026-09-15', groceries), null)
  assert.equal(paceOver(25000, 20000, '2026-09-01', '2026-09-15', groceries), null)  // already over: the bar says so
  assert.equal(paceOver(15000, 20000, '2026-08-01', '2026-09-15', groceries), null)  // a past month has no pace
  assert.equal(paceOver(15000, 20000, '2026-09-01', '2026-09-15'), null)  // no history to go by
  // Rent paid on the 1st is all there by the 5th: nothing more is coming, so it isn't on pace to go over.
  assert.equal(paceOver(140000, 140000, '2026-09-01', '2026-09-05', { by: 140000, full: 140000 }), null)
})

test('suggestBudgets: average of the last three completed months, up to the next $10', () => {
  const b = boot({
    today: '2026-12-02',
    categories: [cat(2, 'Spending'), cat(3, 'Spending', { active: false }), cat(4, 'Money in')],
    months: ['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01'].map((m, i) =>
      month(m, { by_category: { 2: [99999, 10000, 20001, 30000, 5][i], 3: 5000, 4: 900000 } })),
  })
  const s = suggestBudgets(b)
  assert.equal(s.length, 1)
  assert.equal(s[0].average, 20000)
  assert.equal(s[0].suggested, 20000)
  assert.equal(s[0].months, 3)
})

test('paceWindow spans last month and this one', () => {
  assert.deepEqual(paceWindow('2026-03-15'), { start: '2026-02-01', end: '2026-03-31' })
  assert.deepEqual(paceWindow('2026-01-31'), { start: '2025-12-01', end: '2026-01-31' })
})

test('paceFrom: cumulative by day, future rows scheduled, refunds subtract', () => {
  const items = [row('2026-08-02', 1000), row('2026-08-31', 500), row('2026-09-01', 300), row('2026-09-03', -100),
    row('2026-09-24', 50), row('2026-09-25', 7000)] // usePace only asks for rows inside paceWindow
  const p = paceFrom(items, '2026-09-24')
  assert.equal(p.days, 30)
  assert.equal(p.cur.length, 24)
  assert.equal(p.cur[0], 300)
  assert.equal(p.cur[2], 200)
  assert.equal(p.cur.at(-1), 250)
  assert.equal(p.scheduled, 7000)
  assert.equal(p.prev[0], 0)
  assert.equal(p.prev[1], 1000)
  assert.equal(p.prev[29], 1000) // Aug 30; Aug 31's row lands past this month's last day
  assert.equal(p.month, '2026-09-01')
  assert.equal(p.prevMonth, '2026-08-01')
})

test('paceFrom: a short month after a long one, and a leap February', () => {
  const p = paceFrom([row('2026-01-31', 100)], '2026-02-28')
  assert.equal(p.days, 28)
  assert.equal(p.prev.length, 28)
  const leap = paceFrom([row('2028-02-29', 70)], '2028-02-29')
  assert.equal(leap.days, 29)
  assert.equal(leap.cur.at(-1), 70)
  const march = paceFrom([row('2028-02-29', 70)], '2028-03-31')
  assert.equal(march.prev.at(-1), 70) // Feb's total carries across March's longer tail
})

test('typicalFrom: spending by this day of the month in the months before', () => {
  const months = monthsBefore('2026-11-04', 3, '2026-09-01')
  assert.deepEqual(months, ['2026-09-01', '2026-10-01']) // nothing before Tally started counting
  const items = [
    { date: '2026-09-01', amount: 140000, category_id: 1 }, { date: '2026-10-01', amount: 140000, category_id: 1 },
    { date: '2026-09-03', amount: 5000, category_id: 2 }, { date: '2026-09-20', amount: 15000, category_id: 2 },
    { date: '2026-10-28', amount: 20000, category_id: 2 }, { date: '2026-11-02', amount: 999, category_id: 2 },
  ]
  const t = typicalFrom(items, months, 4)
  assert.equal(t.by.get(1), 140000) // rent is all there by the 4th
  assert.equal(t.full.get(1), 140000)
  assert.equal(t.by.get(2), 2500)
  assert.equal(t.full.get(2), 20000)
})

test('monthBudget and budgetLine: the month against all its budgets at once', () => {
  const cats = [cat(2, 'Spending', { budget: 40000 }), cat(3, 'Spending', { budget: 10000 }), cat(4, 'Spending'), cat(5, 'Spending', { budget: 9000, active: false })]
  const m = month('2026-09-01', { by_category: { 2: 30000, 3: 4000, 4: 99999, 5: 1 } })
  const b = boot({ today: '2026-09-22', categories: cats })
  assert.deepEqual(monthBudget(b, m), { budget: 50000, spent: 34000, ids: [2, 3] }) // unbudgeted and hidden stay out
  assert.deepEqual(budgetLine(b, m, null), { text: '$160 of your $500 budget left for 8 more days', tone: 'label2' })
  assert.equal(budgetLine(boot({ today: '2026-09-30', categories: cats }), m, null)?.text, '$160 of your $500 budget left today')
  // Usually another $250 comes after the 22nd: 340 + 250 is $90 over.
  const typical = { by: new Map([[2, 10000], [3, 0]]), full: new Map([[2, 35000], [3, 0]]) }
  assert.deepEqual(budgetLine(b, m, typical), { text: 'On pace to go $90 over your $500 budget', tone: 'warn' })
  const over = month('2026-09-01', { by_category: { 2: 52000 } })
  assert.deepEqual(budgetLine(b, over, typical), { text: '$20 over your $500 budget', tone: 'neg' })
  // A finished month only speaks up when it went over; a month not started says nothing.
  const later = boot({ today: '2026-10-05', categories: cats })
  assert.equal(budgetLine(later, m, null), null)
  assert.deepEqual(budgetLine(later, over, null), { text: 'Finished $20 over its $500 budget', tone: 'neg' })
  assert.equal(budgetLine(boot({ today: '2026-08-20', categories: cats }), m, null), null)
  assert.equal(budgetLine(boot({ categories: [cat(2, 'Spending')] }), m, null), null)
})

test('paidBill: a recurring category that took its whole budget', () => {
  const r = { id: 1, label: 'Rent', category_id: 2, from_account_id: 1, to_account_id: null, amount: 140000, what: 'Rent', freq: 'monthly' as const,
    next_date: '2026-10-01', horizon_days: 45, active: 1, anchor_day: 1, created_at: '' }
  const b = boot({ recurring: [r] })
  assert.equal(paidBill(b, 2, 140000, 140000), true)
  assert.equal(paidBill(b, 2, 70000, 140000), false)
  assert.equal(paidBill(b, 3, 140000, 140000), false)
  assert.equal(paidBill(boot({ recurring: [{ ...r, active: 0 }] }), 2, 140000, 140000), false)
})

test('billTest: posted by a template, or the same place and category as one', () => {
  const r = { id: 1, label: 'Rent', category_id: 2, from_account_id: 1, to_account_id: null, amount: 140000, what: 'Rent', freq: 'monthly' as const,
    next_date: '2026-10-01', horizon_days: 45, active: 1, anchor_day: 1, created_at: '' }
  const bill = billTest(boot({ recurring: [r] }))
  assert.equal(bill(row('2026-09-01', 140000, { what: 'RENT', category_id: 2 })), true) // typed by hand
  assert.equal(bill(row('2026-09-01', 140000, { what: 'Rent', category_id: 3 })), false)
  assert.equal(bill(row('2026-09-01', 999, { what: 'Gym', category_id: 3, recurring_id: 4 })), true)
  assert.equal(bill(row('2026-09-01', 999, { what: 'Market', category_id: 2 })), false)
})
