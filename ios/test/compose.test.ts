import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CatType, Favorite, Txn } from '@/lib/api'
import { addedText, addLabel, dayNote, exactPlace, namesPlace, places, quickFill, signed } from '@/lib/compose'
import { row } from './fixtures.ts'

process.env.TZ = 'America/Denver'

const CATS: Record<number, { type: CatType; name: string }> = {
  1: { type: 'Money in', name: 'Paycheck' }, 2: { type: 'Spending', name: 'Gas' }, 3: { type: 'Spending', name: 'Groceries' },
  4: { type: 'Saving', name: 'Emergency fund' }, 5: { type: 'Transfer', name: 'Card payment' },
}
const catOf = (x: Txn) => CATS[x.category_id]
const fav = (x: Partial<Favorite>): Favorite =>
  ({ id: 1, label: 'Gas', category_id: 2, from_account_id: 7, to_account_id: null, amount: null, sort: 0, icon: null, color: null, ...x })

test('quick action: a typed amount stays, the chip only fills the rest', () => {
  const coffee = fav({ label: 'Coffee', category_id: 3, amount: 575 })
  assert.equal(quickFill(coffee, CATS[3], false).amount, '5.75')
  const typed = quickFill(coffee, CATS[3], true)
  assert.equal('amount' in typed, false)
  assert.deepEqual([typed.what, typed.category_id, typed.from_id, typed.kind], ['Coffee', 3, 7, 'Spending'])
  assert.equal(quickFill(fav({ amount: -1999, category_id: 3, label: 'Return' }), CATS[3], false).refund, true)
})

test('quick action: a label that is only the category name leaves the name to fill in', () => {
  assert.equal(namesPlace('Gas', 'Gas'), false)
  assert.equal(namesPlace('  groceries ', 'Groceries'), false)
  assert.equal(namesPlace('Chevron', 'Gas'), true)
  assert.equal(quickFill(fav({}), CATS[2], false).what, '')
  assert.equal(quickFill(fav({ label: 'Chevron' }), CATS[2], false).what, 'Chevron')
  assert.equal(quickFill(fav({ category_id: 1, label: 'Paycheck' }), CATS[1], false).kind, 'Money in')
})

// Newest first, like the history the composer loads.
const history = [
  row('2026-09-20', 5000, { what: 'Gas', category_id: 2 }), // left by a Gas chip
  row('2026-09-19', 6200, { what: 'Safeway', category_id: 3 }),
  row('2026-09-18', 4800, { what: 'Chevron', category_id: 2 }),
  row('2026-09-17', 50000, { what: 'Transfer to savings', category_id: 4, to_id: 9 }),
  row('2026-09-16', 4100, { what: 'Shell', category_id: 2 }),
  row('2026-09-15', 218540, { what: 'Acme Corp', category_id: 1, from_id: null, to_id: 1 }),
  row('2026-09-14', 4500, { what: 'Chevron', category_id: 2 }),
  row('2026-09-13', 900, { what: 'chipotle', category_id: 3 }),
  row('2026-09-12', 30000, { what: 'Transfer to savings', category_id: 5, to_id: 9 }),
]
const names = (xs: Txn[]) => xs.map((x) => x.what)

test('places: nothing typed lists this kind, the picked category first, most used first', () => {
  assert.deepEqual(names(places(history, catOf, { text: '', kind: 'Spending', category: null })), ['Gas', 'Safeway', 'Chevron', 'Shell', 'chipotle'])
  assert.deepEqual(names(places(history, catOf, { text: '', kind: 'Spending', category: 2 })), ['Chevron', 'Shell', 'Gas', 'Safeway', 'chipotle'])
})

test('places: typing matches every kind, this kind first, the full name on top', () => {
  const t = places(history, catOf, { text: 'Transf', kind: 'Transfer', category: null })
  assert.deepEqual(names(t), ['Transfer to savings'])
  assert.equal(t[0].category_id, 5) // the row as it went under Transfer, though the newer one is under Saving
  assert.equal(places(history, catOf, { text: 'transf', kind: 'Spending', category: null })[0].category_id, 4)
  assert.deepEqual(names(places(history, catOf, { text: 'ch', kind: 'Spending', category: null })), ['Chevron', 'chipotle'])
  assert.deepEqual(names(places(history, catOf, { text: 'ac', kind: 'Spending', category: null })), ['Acme Corp'])
})

test('exactPlace: a name typed in full is that place, case aside', () => {
  assert.equal(exactPlace(history, catOf, 'CHIPOTLE', 'Spending')?.what, 'chipotle')
  assert.equal(exactPlace(history, catOf, 'Chevron', 'Spending')?.date, '2026-09-18') // the newest
  assert.equal(exactPlace(history, catOf, 'Chev', 'Spending'), undefined)
  assert.equal(exactPlace(history, catOf, '', 'Spending'), undefined)
  assert.equal(exactPlace(history, catOf, 'transfer to savings', 'Transfer')?.category_id, 5)
  assert.equal(exactPlace(history, catOf, 'transfer to savings', 'Spending')?.category_id, 4)
})

test('the figure reads like Activity: money in and refunds green with a +', () => {
  assert.deepEqual(signed(6226, 'Spending', false), { text: '$62.26', pos: false })
  assert.deepEqual(signed(6226, 'Spending', true), { text: '+$62.26', pos: true })
  assert.deepEqual(signed(218540, 'Money in', false), { text: '+$2,185.40', pos: true })
  assert.deepEqual(signed(500, 'Money in', true), { text: '−$5.00', pos: false })
  assert.deepEqual(signed(50000, 'Transfer', false), { text: '$500.00', pos: false })
  assert.equal(addLabel(6226, 'Spending', true), 'Add refund $62.26')
  assert.equal(addLabel(540, 'Spending', false), 'Add $5.40')
})

test('the toast after Add says what went where, and the day when it is not today', () => {
  const base = { cents: 11284, kind: 'Spending' as CatType, refund: false, what: 'Safeway', category: 'Groceries', account: undefined, date: '2026-11-22', today: '2026-11-22' }
  assert.equal(addedText(base), 'Added $112.84 to Groceries')
  assert.equal(addedText({ ...base, date: '2026-11-14' }), 'Added $112.84 to Groceries, Sat Nov 14')
  assert.equal(addedText({ ...base, date: '2026-11-21' }), 'Added $112.84 to Groceries, yesterday')
  assert.equal(addedText({ ...base, cents: 6226, refund: true, category: 'Shopping' }), 'Refunded $62.26 to Shopping')
  assert.equal(addedText({ ...base, cents: 218540, kind: 'Money in', what: 'Acme Corp', category: 'Paycheck', account: 'Checking' }), 'Acme Corp, +$2,185.40 to Checking')
  assert.equal(addedText({ ...base, cents: 218540, kind: 'Money in', what: ' ', account: 'Checking' }), 'Added +$2,185.40 to Checking')
  assert.equal(dayNote('2025-12-30', '2026-01-05'), 'Tue Dec 30 2025')
  assert.equal(dayNote('2026-11-23', '2026-11-22'), 'tomorrow')
  assert.equal(dayNote('2026-11-22', '2026-11-22'), '')
})
