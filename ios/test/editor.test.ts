// The entry editor's logic: split lines that balance themselves, tag suggestions, repeating an entry, and telling
// whether a draft has changed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { repeatFields } from '@/lib/actions'
import { todayISO } from '@/lib/dates'
import { blank } from '@/lib/draft'
import { addTag, balanceFirst, nextMonthly, parseTags, putLine, tagSuggestions } from '@/lib/txn'
import { snap } from '@/lib/unsaved'
import { row } from './fixtures.ts'

test('the first split line takes what the others leave', () => {
  const lines = [{ key: 'a', category_id: 1, amount: '120.00' }, { key: 'b', category_id: null, amount: '40.00' }]
  assert.deepEqual(balanceFirst(lines, 12000).map((l) => l.amount), ['80', '40.00'])
  const three = [...lines, { key: 'c', category_id: 2, amount: '15.50' }]
  assert.equal(balanceFirst(three, 12000)[0].amount, '64.50')
  // More in the other lines than the total: line 1 goes to nothing, never below.
  assert.equal(balanceFirst([lines[0], { ...lines[1], amount: '150.00' }], 12000)[0].amount, '')
  assert.deepEqual(balanceFirst([lines[0]], 500), [lines[0]])
})

test('line 1 stops balancing once typed into, and the draft remembers it', () => {
  const start = [{ key: 'a', category_id: 1, amount: '120.00' }, { key: 'b', category_id: null, amount: '' }]
  let lines = putLine(start, 'a', '50.00', 12000)
  assert.equal(lines[0].typed, true)
  lines = putLine(lines, 'b', '40.00', 12000)
  assert.deepEqual(lines.map((l) => l.amount), ['50.00', '40.00'])
  // A restored draft is a copy of the store's: the flag travels with it, so line 1 keeps the $50 typed into it.
  const restored = JSON.parse(JSON.stringify(lines))
  assert.deepEqual(putLine(restored, 'b', '45.00', 12000).map((l) => l.amount), ['50.00', '45.00'])
  // Untouched, it still takes what's left.
  assert.deepEqual(putLine(start, 'b', '40.00', 12000).map((l) => l.amount), ['80', '40.00'])
})

test('a repeat starts on the same day of the month after today', () => {
  assert.equal(nextMonthly('2026-10-05', '2026-11-22'), '2026-12-05')
  assert.equal(nextMonthly('2026-11-22', '2026-11-22'), '2026-12-22')
  assert.equal(nextMonthly('2026-11-25', '2026-11-22'), '2026-12-25')
  // The 31st lands on a short month's last day (the template's anchor_day brings it back to the 31st after).
  assert.equal(nextMonthly('2027-01-31', '2027-02-01'), '2027-02-28')
  assert.equal(nextMonthly('2027-01-31', '2027-02-28'), '2027-03-31')
  assert.equal(nextMonthly('2026-12-15', '2026-12-20'), '2027-01-15')
})

test('repeating an entry from the 31st keeps aiming for the 31st', () => {
  const r = repeatFields(row('2099-01-31', 4000, { what: 'Gym' }), '2099-02-01', 'Gym')
  assert.equal(r.next_date, '2099-02-28')
  assert.equal(r.anchor_day, 31)
  assert.equal(r.amount, '40')
  // A list's day can be yesterday's: the template still starts after the phone's today.
  assert.ok(repeatFields(row('2000-01-05', 100), '2000-01-06', 'X').next_date > todayISO())
})

test('tags parse loosely and suggestions follow the tag being typed', () => {
  assert.deepEqual(parseTags('#Trip, work  gift'), ['trip', 'work', 'gift'])
  const used = [{ tag: 'trip', count: 9 }, { tag: 'work', count: 4 }, { tag: 'reimburse', count: 2 }, { tag: 'tripod', count: 1 }]
  assert.deepEqual(tagSuggestions(used, ''), ['trip', 'work', 'reimburse', 'tripod'])
  assert.deepEqual(tagSuggestions(used, 'tr'), ['trip', 'tripod'])
  assert.deepEqual(tagSuggestions(used, 'trip'), ['tripod']) // typed in full: it's on the entry already
  assert.deepEqual(tagSuggestions(used, 'trip '), ['work', 'reimburse', 'tripod'])
  assert.deepEqual(tagSuggestions(used, 'work re'), ['reimburse'])
  assert.deepEqual(tagSuggestions(used, '', 2), ['trip', 'work'])
})

test('a picked tag replaces the one being typed, or goes on the end', () => {
  assert.deepEqual(addTag('', 'trip'), ['trip'])
  assert.deepEqual(addTag('work re', 'reimburse'), ['work', 'reimburse'])
  assert.deepEqual(addTag('work ', 'trip'), ['work', 'trip'])
  assert.deepEqual(addTag('#Trip wo', 'work'), ['trip', 'work'])
  assert.deepEqual(addTag('trip, ', 'trip'), ['trip']) // never twice
})

test('a draft counts as changed only for what would be saved', () => {
  const d = { ...blank('2026-11-22'), amount: '5.4', what: 'Coffee' }
  assert.equal(snap(d), snap({ ...d, amount: '5.40', target: 'b' }))
  assert.notEqual(snap(d), snap({ ...d, amount: '5.41' }))
  assert.notEqual(snap(d), snap({ ...d, tags: ['trip'] }))
  assert.notEqual(snap(d), snap({ ...d, date: '2026-11-21' }))
})
