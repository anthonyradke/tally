import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CatType, Favorite, Txn } from '@/lib/api'
import { addedText, addedToast, addLabel, chipIn, chipOut, draftAdded, exactPlace, namesPlace, places, quickFill, signed, toKind, withKind } from '@/lib/compose'
import { blank, type Draft } from '@/lib/draft'
import { formatCents } from '@/lib/money'
import { rowAmount } from '@/lib/txn'
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

test('quick action: a chip with its own amount keeps its name, even when it is the category name', () => {
  const rent = fav({ label: 'Rent', category_id: 6, amount: 140000 })
  const f = quickFill(rent, { type: 'Spending', name: 'Rent' }, false)
  assert.deepEqual([f.what, f.amount], ['Rent', '1400'])
  assert.equal(quickFill(rent, { type: 'Spending', name: 'Rent' }, true).what, 'Rent') // the amount typed over it
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
  assert.equal(exactPlace(history, catOf, 'transfer to savings', 'Spending'), undefined) // only under Saving and Transfer
  assert.equal(exactPlace(history, catOf, 'acme corp', 'Spending'), undefined) // Return doesn't switch the kind
})

test('the figure reads like Activity: money in and refunds green with a +', () => {
  assert.deepEqual(signed(6226, 'Spending', false), { text: '$62.26', tone: 'neutral' })
  assert.deepEqual(signed(6226, 'Spending', true), { text: '+$62.26', tone: 'pos' })
  assert.deepEqual(signed(218540, 'Money in', false), { text: '+$2,185.40', tone: 'pos' })
  assert.deepEqual(signed(500, 'Money in', true), { text: '−$5.00', tone: 'neg' })
  assert.deepEqual(signed(50000, 'Transfer', false), { text: '$500.00', tone: 'neutral' })
  assert.equal(addLabel(6226, 'Spending', true), 'Add refund $62.26')
  assert.equal(addLabel(540, 'Spending', false), 'Add $5.40')
})

test('the figure matches the Activity row for every kind and sign', () => {
  for (const kind of ['Spending', 'Money in', 'Transfer', 'Saving', 'Loan'] as CatType[]) {
    for (const refund of [false, true]) {
      const r = rowAmount(kind, refund ? -1234 : 1234)
      const f = signed(1234, kind, refund)
      assert.equal(f.text, formatCents(r.cents, { sign: r.sign }), `${kind} ${refund}`)
      assert.equal(f.tone, r.tone)
    }
  }
  // A negative saving reads like Activity's, with no −.
  assert.deepEqual(signed(2500, 'Saving', true), { text: '$25.00', tone: 'neutral' })
})

test('the toast after Add says what went where, and the day when it is not today', () => {
  const base = { cents: 11284, kind: 'Spending' as CatType, refund: false, what: 'Safeway', category: 'Groceries', account: undefined, date: '2026-11-22', today: '2026-11-22' }
  assert.equal(addedText(base), 'Added $112.84 to Groceries')
  assert.equal(addedText({ ...base, date: '2026-11-14' }), 'Added $112.84 to Groceries on Sat, Nov 14')
  assert.equal(addedText({ ...base, date: '2026-11-21' }), 'Added $112.84 to Groceries yesterday')
  assert.equal(addedText({ ...base, date: '2026-11-23' }), 'Added $112.84 to Groceries tomorrow')
  assert.equal(addedText({ ...base, date: '2025-12-30', today: '2026-01-05' }), 'Added $112.84 to Groceries on Tue, Dec 30, 2025')
  assert.equal(addedText({ ...base, cents: 6226, refund: true, category: 'Shopping' }), 'Refunded $62.26 to Shopping')
  assert.equal(addedText({ ...base, cents: 218540, kind: 'Money in', what: 'Acme Corp', category: 'Paycheck', account: 'Checking' }), 'Acme Corp, +$2,185.40 to Checking')
  assert.equal(addedText({ ...base, cents: 218540, kind: 'Money in', what: ' ', account: 'Checking' }), 'Added +$2,185.40 to Checking')
})

const draft = (x: Partial<Draft> = {}): Draft => ({ ...blank('2026-11-22'), ...x })
const apply = (d: Draft, p: Partial<Draft>): Draft => ({ ...d, ...p })

test('quick actions: switching chips swaps the amount a chip brought, never one you typed', () => {
  const coffee = fav({ id: 1, label: 'Coffee', category_id: 3, amount: 575 })
  const lunch = fav({ id: 2, label: 'Lunch', category_id: 3, amount: 1200 })
  const gas = fav({ id: 3, label: 'Gas', category_id: 2, amount: null })
  const a = chipIn(draft(), coffee, CATS[3], { gave: false, summing: false })
  const d1 = apply(draft(), a.patch)
  assert.deepEqual([d1.amount, a.gave], ['5.75', true])
  // Back to the amount page, Lunch instead: its $12 replaces Coffee's.
  const b = chipIn(d1, lunch, CATS[3], { gave: a.gave, summing: false })
  assert.deepEqual([apply(d1, b.patch).amount, b.gave], ['12', true])
  // A chip with no amount after one that brought it: Coffee's $5.75 goes with Coffee.
  const g = chipIn(d1, gas, CATS[2], { gave: true, summing: false })
  assert.deepEqual([apply(d1, g.patch).amount, g.gave], ['', false])
  // An amount you typed (gave is false once a key is pressed) stays through any chip.
  const typed = draft({ amount: '4.50' })
  const t = chipIn(typed, lunch, CATS[3], { gave: false, summing: false })
  assert.deepEqual([apply(typed, t.patch).amount, t.gave], ['4.50', false])
})

test('quick actions: taking one back out keeps what you typed, the kind and the account it was opened from', () => {
  const d = draft({ kind: 'Money in', amount: '20', what: 'Acme', category_id: 1, to_id: 4 })
  assert.deepEqual(chipOut(d, false, 4), { ...draft(), kind: 'Money in', from_id: null, to_id: 4, amount: '20' })
  assert.equal(chipOut(d, true, null).amount, '') // the chip's amount goes with it
  const spent = chipOut(draft({ amount: '3', refund: true, category_id: 3, from_id: 2 }), false, 2)
  assert.deepEqual([spent.from_id, spent.category_id, spent.refund], [2, null, true])
})

test('a refund does not survive a change to another kind', () => {
  const refund = draft({ refund: true, amount: '5.00' })
  const paycheck = fav({ label: 'Paycheck', category_id: 1, from_account_id: null, to_account_id: 4 })
  assert.equal(apply(refund, chipIn(refund, paycheck, CATS[1], { gave: false, summing: false }).patch).refund, false)
  assert.equal(withKind(refund, { kind: 'Money in', category_id: 1 }).refund, false) // a past Money in row
  assert.equal(withKind(refund, { kind: 'Spending', category_id: 3 }).refund, true) // still spending: it stays
  assert.equal(toKind(refund, 'Transfer', 'Spending', null).refund, false)
  // A chip saved with a negative amount brings its own.
  const fix = fav({ label: 'Paycheck fix', category_id: 1, amount: -500, from_account_id: null, to_account_id: 4 })
  assert.equal(chipIn(draft(), fix, CATS[1], { gave: false, summing: false }).patch.refund, true)
})

test('the kind switch keeps the account it was opened from on the side that fits', () => {
  const d = draft({ from_id: 4, category_id: 3 })
  assert.deepEqual(toKind(d, 'Money in', 'Spending', 4), { kind: 'Money in', category_id: null, from_id: null, to_id: 4, refund: false })
  assert.deepEqual(toKind(d, 'Spending', 'Spending', 4), { kind: 'Spending', category_id: 3, from_id: 4, to_id: null, refund: false })
})

test('the form and the composer say the same after Add, a split naming its categories', () => {
  const name = { cat: (id: number) => CATS[id]?.name, acct: (id: number) => (id === 9 ? 'Checking' : undefined) }
  const d = draft({ amount: '120', category_id: 3, what: 'Target' })
  assert.equal(draftAdded(d, name, '2026-11-22'), 'Added $120.00 to Groceries')
  const two = { ...d, split: [{ key: 'a', category_id: 3, amount: '80' }, { key: 'b', category_id: 2, amount: '40' }] }
  assert.equal(draftAdded(two, name, '2026-11-22'), 'Added $120.00 to Groceries and Gas')
  const same = { ...d, split: [{ key: 'a', category_id: 3, amount: '80' }, { key: 'b', category_id: 3, amount: '40' }] }
  assert.equal(draftAdded(same, name, '2026-11-22'), 'Added $120.00 to Groceries')
  const three = { ...two, split: [...two.split, { key: 'c', category_id: 4, amount: '0' }] }
  assert.equal(draftAdded({ ...three, date: '2026-11-21' }, name, '2026-11-22'), 'Added $120.00 to 3 categories yesterday')
  assert.equal(draftAdded(draft({ amount: '2185.40', kind: 'Money in', category_id: 1, to_id: 9, what: 'Acme Corp' }), name, '2026-11-22'), 'Acme Corp, +$2,185.40 to Checking')

  const again = { label: 'Add another', run: () => {} }
  const open = () => {}
  assert.deepEqual(addedToast('Added $5.40', { lost: false, again, open }), { text: 'Added $5.40', action: again, onPress: open })
  const lost = addedToast('Added $5.40', { lost: true, again, open })
  assert.equal(lost.tone, 'error')
  assert.equal(lost.action, again)
  assert.equal(lost.onPress, open)
  assert.match(lost.text, /^Added \$5\.40, but the receipt photo didn't upload/)
})
