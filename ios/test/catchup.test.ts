import { test } from 'node:test'
import assert from 'node:assert/strict'
import { catchable, flip, lookalikes, otherSide, sides, suggest, usualCategories } from '@/lib/catchup'
import { fits } from '@/lib/shapes'
import { acct, row } from './fixtures'

const CHK = 1, CARD = 2, SAV = 3

test('catchup: the accounts offered are cash and cards still in use', () => {
  const list = catchable([acct(1, 'cash'), acct(2, 'card'), acct(3, 'investment'), acct(4, 'loan'), acct(5, 'card', 0, { active: false })])
  assert.deepEqual(list.map((a) => a.id), [1, 2])
})

test('catchup: the account goes on the side each kind uses', () => {
  assert.deepEqual(sides('Spending', CARD), { from_id: CARD, to_id: null })
  assert.deepEqual(sides('Money in', CHK), { from_id: null, to_id: CHK })
  assert.deepEqual(sides('Transfer', CHK), { from_id: CHK, to_id: null })
  // A spending entry copied from another card still comes off this one.
  assert.deepEqual(sides('Spending', CARD, { from_id: 9, to_id: null }), { from_id: CARD, to_id: null })
})

test('catchup: a copied transfer keeps its direction and other account', () => {
  // Paying the card from checking, entered while catching up checking.
  assert.deepEqual(sides('Transfer', CHK, { from_id: CHK, to_id: CARD }), { from_id: CHK, to_id: CARD })
  // The same payment seen from the card's side: money comes in from checking.
  assert.deepEqual(sides('Transfer', CARD, { from_id: CHK, to_id: CARD }), { from_id: CHK, to_id: CARD })
  // Saving into the savings account from checking, caught up from savings.
  assert.deepEqual(sides('Saving', SAV, { from_id: CHK, to_id: SAV }), { from_id: CHK, to_id: SAV })
  // A transfer between two other accounts: this one sends, to the copied one's destination.
  assert.deepEqual(sides('Transfer', SAV, { from_id: CHK, to_id: CARD }), { from_id: SAV, to_id: CARD })
  // Switching a spending draft to a transfer leaves the other side to pick.
  assert.deepEqual(sides('Transfer', CARD, { from_id: CARD, to_id: null }), { from_id: CARD, to_id: null })
})

test('catchup: flipping a transfer turns it around, and the other side follows', () => {
  const out = { from_id: CHK, to_id: CARD }
  assert.deepEqual(flip(out), { from_id: CARD, to_id: CHK })
  assert.deepEqual(otherSide(out, CHK), { side: 'to', id: CARD })
  assert.deepEqual(otherSide(flip(out), CHK), { side: 'from', id: CARD })
  // A saving with nothing on the other side, flipped, needs a From before it fits.
  const lone = flip({ from_id: SAV, to_id: null })
  assert.deepEqual(otherSide(lone, SAV), { side: 'from', id: null })
  assert.equal(fits(lone, 'Saving'), false)
})

test('catchup: suggestions put this account\'s usual places first', () => {
  const h = [
    row('2026-10-30', 650, { what: 'Starbucks', from_id: CARD, category_id: 5 }),
    row('2026-10-29', 4000, { what: 'Shell', from_id: CHK, category_id: 6 }),
    row('2026-10-28', 500, { what: 'Starbucks', from_id: CHK, category_id: 5 }),
    row('2026-10-27', 4100, { what: 'Shell', from_id: CHK, category_id: 6 }),
    row('2026-10-26', 1200, { what: 'Sprouts', from_id: CHK, category_id: 7 }),
    row('2026-10-25', 700, { what: 'Starbucks', from_id: CARD, category_id: 5 }),
  ]
  // Nothing typed: only places this account has seen, most often first.
  assert.deepEqual(suggest(h, CHK, '').map((x) => x.what), ['Shell', 'Starbucks', 'Sprouts'])
  assert.deepEqual(suggest(h, CARD, '').map((x) => x.what), ['Starbucks'])
  // Typing narrows by name; a place this account never saw still shows, after its own.
  assert.deepEqual(suggest(h, CARD, 'sh').map((x) => x.what), ['Shell'])
  assert.deepEqual(suggest(h, CARD, 's').map((x) => x.what), ['Starbucks', 'Shell', 'Sprouts'])
  // The row copied is how it went on this account (Starbucks on checking was the 28th, not the card's 30th).
  assert.equal(suggest(h, CHK, 'star')[0].date, '2026-10-28')
})

test('catchup: usual categories count only this account', () => {
  const h = [row('2026-10-30', 1, { from_id: CARD, category_id: 5 }), row('2026-10-29', 1, { from_id: CHK, category_id: 6 }),
    row('2026-10-28', 1, { from_id: CHK, category_id: 6 }), row('2026-10-27', 1, { to_id: CHK, from_id: null, category_id: 1 })]
  assert.deepEqual(usualCategories(h, CHK), [6, 1])
})

test('catchup: lookalikes are the same amount on the account within three days', () => {
  const h = [
    row('2026-10-30', 15000, { what: 'Amex payment', from_id: CHK, to_id: CARD }),
    row('2026-10-20', 15000, { what: 'Old payment', from_id: CHK, to_id: CARD }),
    row('2026-10-31', 15000, { what: 'Elsewhere', from_id: SAV }),
    row('2026-10-31', 14999, { what: 'Close', from_id: CARD }),
  ]
  assert.deepEqual(lookalikes(h, { date: '2026-11-02', amount: 15000 }, CARD).map((x) => x.what), ['Amex payment'])
  assert.deepEqual(lookalikes(h, { date: '2026-11-04', amount: 15000 }, CARD), [])
  assert.deepEqual(lookalikes(h, { date: '2026-11-02', amount: 0 }, CARD), [])
})
