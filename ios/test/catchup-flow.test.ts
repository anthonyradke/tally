import { test } from 'node:test'
import assert from 'node:assert/strict'
import { balanceWords, exactPlace, hintFor, midSentence, runningBalances, sides, usualCategories } from '@/lib/catchup'
import { staleAccounts } from '@/lib/caughtUp'
import { formatCents } from '@/lib/money'
import { acct, row } from './fixtures'

const CHK = 1, CARD = 2, SAV = 3
const card = acct(CARD, 'card')
const blankSides = { from_id: null, to_id: null }

test('catchup: a card payment picked on the card comes in, from how the last one went', () => {
  const h = [
    row('2026-10-30', 650, { from_id: CARD, category_id: 5 }),
    row('2026-10-20', 90000, { from_id: CHK, to_id: CARD, category_id: 8 }),
  ]
  // The latest card payment on the card came from checking: the next one does too.
  assert.deepEqual(sides('Transfer', CARD, hintFor(h, card, 8, 'Transfer', blankSides)), { from_id: CHK, to_id: CARD })
  // Never paid this way before: a transfer onto a card is a payment, so money comes in and the From is left to pick.
  assert.deepEqual(sides('Transfer', CARD, hintFor([], card, 8, 'Transfer', blankSides)), { from_id: null, to_id: CARD })
  assert.deepEqual(sides('Loan', 4, hintFor([], acct(4, 'loan'), 9, 'Loan', blankSides)), { from_id: null, to_id: 4 })
  // On checking, a transfer still goes out unless the draft says otherwise.
  assert.deepEqual(sides('Transfer', CHK, hintFor([], acct(CHK, 'cash'), 8, 'Transfer', blankSides)), { from_id: CHK, to_id: null })
})

test('catchup: Return on an exact name copies that place, a partial one does not', () => {
  const h = [row('2026-10-30', 4780, { what: 'Safeway', from_id: CHK, category_id: 5 }), row('2026-10-29', 900, { what: 'Safeway Fuel', from_id: CHK, category_id: 6 })]
  assert.equal(exactPlace(h, CHK, 'safeway ')?.category_id, 5)
  assert.equal(exactPlace(h, CHK, 'Safe'), null)
  assert.equal(exactPlace(h, CHK, ''), null)
})

test('catchup: chips are the account\'s own by recency, then everyday spending', () => {
  const h = [
    row('2026-10-30', 1, { from_id: CHK, to_id: SAV, category_id: 20 }), // transfer to savings, latest
    row('2026-10-29', 1, { from_id: CHK, to_id: CARD, category_id: 21 }),
    row('2026-10-28', 1, { from_id: CHK, to_id: CARD, category_id: 21 }),
    row('2026-10-27', 1, { from_id: CARD, category_id: 5 }),
    row('2026-10-26', 1, { from_id: CARD, category_id: 5 }),
    row('2026-10-25', 1, { from_id: CARD, category_id: 6 }),
  ]
  const spending = (id: number) => id < 10
  assert.deepEqual(usualCategories(h, CHK), [20, 21])
  assert.deepEqual(usualCategories(h, CHK, 6, spending), [20, 21, 5, 6])
  // Own ones never crowd the everyday ones out entirely.
  const many = Array.from({ length: 8 }, (_, i) => row('2026-10-01', 1, { from_id: CHK, to_id: SAV, category_id: 30 + i }))
  assert.deepEqual(usualCategories([...many, ...h], CHK, 6, spending, 8), [30, 31, 32, 33, 34, 5, 6])
})

test('catchup: running balances follow the bank\'s order, day then entry', () => {
  const chk = acct(CHK, 'cash', 10000)
  const a = row('2026-11-02', 2500, { from_id: CHK })
  const b = row('2026-11-01', 50000, { from_id: null, to_id: CHK })
  const c = row('2026-11-02', 1000, { from_id: CHK })
  const other = row('2026-11-02', 999, { from_id: SAV })
  const r = runningBalances(chk, [a, b, c, other], '2026-10-01')
  assert.deepEqual([r.get(b.id), r.get(a.id), r.get(c.id)], [60000, 57500, 56500])
  assert.equal(r.has(other.id), false)
  // A card counts up as it's charged and down as it's paid.
  const pay = row('2026-11-03', 30000, { from_id: CHK, to_id: CARD })
  const buy = row('2026-11-01', 4500, { from_id: CARD })
  const rc = runningBalances(acct(CARD, 'card', 20000), [pay, buy], '2026-10-01')
  assert.deepEqual([rc.get(buy.id), rc.get(pay.id)], [24500, -5500])
})

test('catchup: a card past zero reads in credit, not negative owed', () => {
  assert.equal(balanceWords('card', -63526, (c) => formatCents(c)), '$635.26 in credit')
  assert.equal(balanceWords('card', 63526, (c) => formatCents(c)), '$635.26 owed')
  assert.equal(balanceWords('cash', -500, (c) => formatCents(c)), formatCents(-500))
  assert.equal(midSentence('2026-11-22', '2026-11-22'), 'today')
  assert.equal(midSentence('2026-11-21', '2026-11-22'), 'yesterday')
  assert.match(midSentence('2026-11-13', '2026-11-22'), /^Fri, Nov 13$/)
})

test('caught-up nudges an account never caught up once its newest entry is a week old', () => {
  const now = new Date(2026, 10, 20, 9)
  const at = { 2: new Date(2026, 10, 1, 8).toISOString() }
  const newest = { 1: '2026-11-12', 2: '2026-11-19', 3: '2026-11-16' }
  assert.deepEqual(staleAccounts(at, [1, 2, 3, 4], now, newest), [{ id: 2, days: 19 }, { id: 1, days: 8, never: true }])
})
