import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bar, barChips, barRows, isAhead, next30, orderChips, orderRows, parseBar, pills, rangeLabel, toggleChip, toggleRow } from '@/lib/filterBar'
import type { Filters } from '@/lib/filters'
import { acct, boot, cat } from './fixtures.ts'

process.env.TZ = 'America/Denver'

const F: Filters = { q: '', type: '', sort: 'date', dir: 'desc' }
const b = boot({ accounts: [acct(1, 'cash'), acct(2, 'card'), acct(3, 'cash', 0, { active: false })], categories: [cat(1, 'Money in'), cat(2, 'Spending')] })
const withSetting = (s: object) => ({ ...b, settings: { activity_filters: JSON.stringify(s) } })

test('filter bar: nothing saved shows the type and account rows, as before', () => {
  assert.deepEqual(bar(b, F).map((r) => r.row), ['type', 'account'])
  assert.deepEqual(bar(b, F)[1].chips.map((c) => c.label), ['A1', 'A2']) // a hidden account has no chip
  assert.deepEqual(parseBar('not json'), {})
})

test('filter bar: rows and chips follow the saved order, and new ones join at their default place', () => {
  let s = toggleRow({}, 'category', true)
  s = orderRows(s, ['type', 'account', 'category', 'when', 'sort']) // category dragged above dates
  assert.deepEqual(barRows(s).map((r) => r.id), ['type', 'account', 'category', 'when', 'sort'])
  assert.deepEqual(bar(withSetting(s), F).map((r) => r.row), ['type', 'account', 'category'])
  s = orderChips(s, 'type', b, ['Spending', 'Transfer', 'Money in', 'Saving', 'Loan']) // Transfers above Money in
  assert.deepEqual(barChips(s, 'type', b).map((c) => c.id), ['Spending', 'Transfer', 'Money in', 'Saving', 'Loan'])
  assert.deepEqual(barRows({ order: ['sort', 'type'], hidden: [] }).map((r) => r.id), ['sort', 'type', 'account', 'when', 'category'])
  assert.deepEqual(barChips(s, 'account', b).map((c) => c.id), ['1', '2']) // accounts start in Settings' order
  s = orderChips(s, 'account', b, ['2', '1'])
  assert.deepEqual(barChips(s, 'account', b).map((c) => c.id), ['2', '1'])
})

test('filter bar: a chip switched off still shows while it is the one picked', () => {
  const s = toggleChip(toggleChip({}, 'type', 'Loan', false), 'account', '2', false)
  const rows = bar(withSetting(s), F)
  assert.ok(!rows[0].chips.some((c) => c.id === 'Loan'))
  assert.deepEqual(rows[1].chips.map((c) => c.id), ['1'])
  const picked = bar(withSetting(s), { ...F, type: 'Loan', account: 3 })
  assert.ok(picked[0].chips.some((c) => c.id === 'Loan'))
  assert.deepEqual(picked[1].chips.map((c) => c.id), ['1', '3']) // a hidden account picked from a link shows lit
})

test('filter bar: filters with nothing lit for them show as pills', () => {
  // b.today is 2026-09-24; by default only the type and account rows show.
  const on: Filters = { ...F, category: 2, start: '2026-08-01', end: '2026-08-31', tag: 'trip', sort: 'amount', dir: 'desc', account: 1 }
  assert.deepEqual(pills(b, on).map((p) => p.label), ['C2', 'Last month', 'Largest', '#trip']) // the account has its chip
  assert.deepEqual(pills(b, F), [])
  // With the dates row on, a named range lights its chip; one no chip stands for still gets a pill.
  const dates = withSetting(toggleRow({}, 'when', true))
  assert.deepEqual(pills(dates, { ...F, start: '2026-08-01', end: '2026-08-31' }), [])
  assert.deepEqual(pills(dates, { ...F, start: '2026-09-02', end: '2026-09-02' }).map((p) => p.label), ['Wed, Sep 2'])
  // Coming up from Home: the next 30 days, soonest first, and taking it off goes back to newest first.
  const ahead = pills(b, { ...F, ...next30(b.today) })
  assert.deepEqual(ahead.map((p) => [p.label, p.clear.dir]), [['Next 30 days', 'desc']])
})

test('filter bar: date ranges in words', () => {
  const today = '2026-11-20'
  assert.equal(rangeLabel({}, today), null)
  assert.equal(rangeLabel({ start: '2026-11-01', end: '2026-11-30' }, today), 'This month')
  assert.equal(rangeLabel({ start: '2026-09-01', end: '2026-09-30' }, today), 'September')
  assert.equal(rangeLabel({ start: '2025-09-01', end: '2025-09-30' }, today), 'September 2025')
  assert.equal(rangeLabel({ start: '2026-11-19', end: '2026-11-19' }, today), 'Yesterday')
  assert.equal(rangeLabel({ start: '2026-10-03', end: '2026-10-20' }, today), 'Oct 3 to Oct 20')
  assert.equal(rangeLabel({ start: '2026-10-03' }, today), 'From Oct 3')
  assert.ok(isAhead({ start: '2026-11-21' }, today) && !isAhead({ start: '2026-11-20' }, today))
})
