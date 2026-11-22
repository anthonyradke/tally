// Home, Insights and the category page telling one story: the same month, the same usual, the same bills.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { billTest, budgetGuide, budgetLine, USUAL_MONTHS, usualBefore, vsUsual } from '@/lib/budgets'
import { bigWeekday } from '@/lib/calendar'
import { addDays, fromISO } from '@/lib/dates'
import { aheadLine } from '@/lib/forecast'
import { formatChange } from '@/lib/money'
import { ledgerMonth, monthChart } from '@/lib/months'
import { buildStory, topSpending } from '@/lib/story'
import { acct, boot, cat, month, row } from './fixtures.ts'

process.env.TZ = 'America/Denver'

const rent = { id: 1, label: 'Rent', category_id: 2, from_account_id: 1, to_account_id: null, amount: 140000, what: 'Rent', freq: 'monthly' as const,
  next_date: '2026-10-01', horizon_days: 45, active: 1, anchor_day: 1, created_at: '' }

test('ledgerMonth: only a month the ledger has, up to this one', () => {
  const b = boot({ today: '2026-09-24', months: [month('2026-08-01'), month('2026-09-01'), month('2026-10-01')] })
  assert.equal(ledgerMonth(b, '2026-08'), '2026-08-01')
  assert.equal(ledgerMonth(b, '2026-09'), '2026-09-01')
  assert.equal(ledgerMonth(b, '2025-01'), null) // before the ledger
  assert.equal(ledgerMonth(b, '2026-10'), null) // a month ahead of today
  assert.equal(ledgerMonth(b, '2026-13'), null)
  assert.equal(ledgerMonth(b, '2026-8'), null)
  assert.equal(ledgerMonth(b, undefined), null)
})

test('usualBefore and vsUsual: Trends and the category page average the same months', () => {
  const values = [90000, 10000, 10000, 10000, 10000, 10000, 14000] // an old big month falls outside the window
  assert.equal(USUAL_MONTHS, 5)
  assert.equal(usualBefore(values, 6), 10000)
  assert.equal(vsUsual(values[6], usualBefore(values, 6)), 0.4)
  assert.equal(usualBefore(values, 2), 50000) // fewer months before: all of them
  assert.equal(usualBefore(values, 0), null)
  assert.equal(vsUsual(10300, 10000), 0) // within 5%: about the same
  assert.equal(vsUsual(100, 0), null)
})

test('budgetGuide: the chart guide only when the budgets cover all the spending', () => {
  const cats = [cat(2, 'Spending', { budget: 40000 }), cat(3, 'Spending', { budget: 10000 }), cat(4, 'Spending'), cat(1, 'Money in')]
  const b = boot({ today: '2026-09-22', categories: cats })
  const covered = month('2026-09-01', { by_category: { 2: 30000, 3: 4000, 1: 500000 } })
  assert.equal(budgetGuide(b, covered), 50000)
  // $600 in an unbudgeted category puts the plotted line past the $500 guide while the sentence says $160 left.
  const outside = month('2026-09-01', { by_category: { 2: 30000, 3: 4000, 4: 60000 } })
  assert.equal(budgetLine(b, outside, null)?.text, '$160 of your $500 budget left for 8 more days')
  assert.equal(budgetGuide(b, outside), null)
  assert.equal(budgetGuide(boot({ categories: [cat(2, 'Spending')] }), covered), null) // no budgets
})

test('buildStory: a paid bill a dollar over its budget is kept, not missed', () => {
  const b = boot({
    today: '2026-10-03', recurring: [rent],
    categories: [cat(2, 'Spending', { budget: 140000 }), cat(3, 'Spending', { budget: 1000 })],
    months: [month('2026-08-01'), month('2026-09-01', { spent: 142050, by_category: { 2: 140050, 3: 2000 } }), month('2026-10-01')],
  })
  const s = buildStory(b, '2026-09-01', [row('2026-09-01', 140050, { what: 'Rent', category_id: 2, recurring_id: 1 })])!
  assert.equal(s.budgets?.kept, 1)
  assert.deepEqual(s.budgets?.missed.map((x) => [x.c.id, x.over]), [[3, 1000]])
})

test('topSpending: Home month in review leaves bills out like the story', () => {
  const b = boot({ recurring: [rent], categories: [cat(2, 'Spending'), cat(3, 'Spending'), cat(4, 'Spending')] })
  const m = month('2026-09-01', { spent: 170000, by_category: { 2: 140000, 3: 20000, 4: 10000 } })
  const rows = [row('2026-09-01', 140000, { what: 'RENT', category_id: 2 }), row('2026-09-05', 20000, { what: 'Market', category_id: 3 }),
    row('2026-09-09', 10000, { what: 'Cafe', category_id: 4 })]
  const t = topSpending(b, m, rows)
  assert.equal(t.besidesBills, true)
  assert.deepEqual(t.top.map((x) => x.c.id), [3, 4])
  assert.equal(buildStory({ ...b, months: [month('2026-08-01'), m] }, '2026-09-01', rows)?.top[0].c.id, 3)
  assert.equal(topSpending(b, m, rows.slice(1)).top[0].c.id, 2) // no bill rows: rent is just the biggest
})

test('formatChange and aheadLine: never $0 beside a change, never −$0', () => {
  assert.equal(formatChange(40), '$0.40')
  assert.equal(formatChange(-40, 'always'), '−$0.40')
  assert.equal(formatChange(165000), '$1,650')
  assert.equal(formatChange(-1250, 'always'), '−$13')
  const base = { inflow: 0, outflow: 30, count: 1, belowZero: null }
  assert.equal(aheadLine({ ...base, a: acct(1, 'cash') }), '1 scheduled, −$0.30')
  assert.equal(aheadLine({ ...base, inflow: 30, count: 2, a: acct(2, 'card') }), '2 scheduled, no change')
  assert.equal(aheadLine({ ...base, outflow: 0, inflow: 20, a: acct(2, 'card') }), '1 scheduled, −$0.20 owed')
})

test('bigWeekday: hand-typed bills stay out when the calendar passes its bill test', () => {
  const b = boot({ recurring: [rent] })
  const flat = []
  for (let d = '2026-07-01'; d < '2026-10-01'; d = addDays(d, 1)) flat.push(row(d, 1000, { what: 'Market', category_id: 3 }))
  // Rent typed by hand on two Tuesdays: no template link, but the same place and category as the template.
  const typed = ['2026-09-01', '2026-08-04'].map((date) => row(date, 140000, { what: 'Rent', category_id: 2 }))
  assert.equal(fromISO('2026-09-01').getDay(), 2)
  assert.equal(bigWeekday([...flat, ...typed], '2026-10-01', '2026-07-01')?.day, 'Tuesdays') // recurring_id alone misses them
  assert.equal(bigWeekday([...flat, ...typed], '2026-10-01', '2026-07-01', 12, billTest(b)), null)
})

test('monthChart: a category page opened on a past month rests its chart there, still', () => {
  const b = boot({ today: '2026-11-22', months: [month('2026-09-01'), month('2026-10-01'), month('2026-11-01'), month('2026-12-01')] })
  assert.deepEqual((({ k, live }) => ({ k, live }))(monthChart(b, '2026-10-01')), { k: 1, live: false })
  const now = monthChart(b, null)
  assert.deepEqual([now.months.length, now.k, now.live], [3, 2, true]) // next month's scheduled rows don't count
  assert.deepEqual((({ k, live }) => ({ k, live }))(monthChart(b, '2026-11-01')), { k: 2, live: true })
  assert.equal(monthChart({ ...b, today: '2026-11-30' }, null).live, false) // the month's last day: nothing still going
  assert.equal(monthChart(b, '2025-01-01').k, 2) // a month outside the chart: this month
})

const xcel = (date: string, amount: number) => row(date, amount, { what: 'Xcel Energy', category_id: 3 })

test('billTest: a bill typed by hand each month counts, given the ledger', () => {
  // Varying with the season, so "Looks like it repeats" wouldn't offer it, but three a month apart make it a bill.
  const history = [xcel('2026-08-12', 7012), xcel('2026-09-12', 11578), xcel('2026-10-12', 9350)]
  const b = boot({ today: '2026-11-22', categories: [cat(1, 'Money in'), cat(2, 'Spending'), cat(3, 'Spending')] })
  assert.equal(billTest(b)(history[2]), false) // without the ledger: templates only
  const bill = billTest(b, [...history].reverse()) // any order
  assert.equal(bill(xcel('2026-11-12', 12000)), true)
  assert.equal(bill(row('2026-10-12', 9350, { what: 'Xcel Energy', category_id: 2 })), false) // another category
  assert.equal(bill(row('2026-10-12', 4000, { what: 'Market', category_id: 3 })), false)
})

test('buildStory: the biggest day bills aside skips a bill typed by hand', () => {
  const b = boot({
    today: '2026-11-22',
    categories: [cat(1, 'Money in'), cat(2, 'Spending'), cat(3, 'Spending')],
    months: [month('2026-09-01'), month('2026-10-01', { spent: 16578, by_category: { 2: 5000, 3: 11578 } }), month('2026-11-01')],
  })
  const rows = [xcel('2026-08-12', 7012), xcel('2026-09-12', 9350), xcel('2026-10-12', 11578), row('2026-10-20', 5000, { what: 'Market' })]
  assert.equal(buildStory(b, '2026-10-01', rows)?.biggestDay?.date, '2026-10-12') // templates only: the bill wins
  const s = buildStory(b, '2026-10-01', rows, billTest(b, rows))!
  assert.equal(s.biggestDay?.date, '2026-10-20')
  assert.equal(s.biggestDay?.billsAside, true)
  assert.deepEqual(topSpending(b, s.m, rows.filter((t) => t.date >= '2026-10-01'), billTest(b, rows)).top.map((x) => x.c.id), [2])
})
