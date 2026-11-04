import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bar, barChips, barRows, orderChips, orderRows, parseBar, toggleChip, toggleRow } from '@/lib/filterBar'
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
  assert.equal(orderChips(s, 'account', b, ['2', '1']), s) // accounts keep Settings' order
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
