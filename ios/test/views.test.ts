// Saved views in the Filters sheet: the string a view is saved and recognized by.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY, fromViewQuery, isView, viewQuery, type Filters } from '@/lib/filters'
import { next30, ranges } from '@/lib/filterBar'

const today = '2026-11-20'

test('saved views: the same filters give the same string whatever order they were set in', () => {
  // Chip by chip: the category set after the defaults, then a range.
  const chips: Filters = { ...EMPTY }
  Object.assign(chips, { category: 5 }, ranges(today).find(([k]) => k === 'last')![2])
  const saved = viewQuery(chips, today)
  assert.equal(saved, 'category=5&when=last&sort=date&dir=desc')
  assert.ok(isView(saved, chips, today))
  const applied = fromViewQuery(saved, today)
  assert.equal(viewQuery(applied, today), saved)
  assert.ok(isView(saved, { ...applied }, today))
})

test("saved views: Home's next 30 days is kept by name and moves on with the calendar", () => {
  const f: Filters = { ...EMPTY, ...next30(today) }
  const saved = viewQuery(f, today)
  assert.ok(saved.includes('when=next30') && !saved.includes('start='))
  const later = fromViewQuery(saved, '2026-12-10')
  assert.deepEqual([later.start, later.end, later.dir], ['2026-12-11', '2027-01-09', 'asc'])
  assert.ok(isView(saved, f, today))
})
