import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Txn } from '@/lib/api'
import { balanceAfter, duplicateOf, hintFor, midSentence, runningBalances, sessionRows, sides, touches, usualCategories } from '@/lib/catchup'
import { exactPlace } from '@/lib/compose'
import { balanceWords } from '@/lib/balances'
import { markCaughtUp, staleAccounts, unmarkCaughtUp, useCaughtUp } from '@/lib/caughtUp'
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
  const mine = (x: Txn) => touches(x, CHK)
  assert.equal(exactPlace(h, 'safeway ', undefined, mine)?.category_id, 5)
  assert.equal(exactPlace(h, 'Safe', undefined, mine), undefined)
  assert.equal(exactPlace(h, '', undefined, mine), undefined)
  // The newest on this account wins over a newer one elsewhere; with none here, the newest anywhere.
  const elsewhere = row('2026-11-02', 5200, { what: 'Safeway', from_id: 9, category_id: 7 })
  assert.equal(exactPlace([elsewhere, ...h], 'Safeway', undefined, mine)?.category_id, 5)
  assert.equal(exactPlace([elsewhere, ...h], 'Safeway', undefined, (x) => touches(x, 4))?.category_id, 7)
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
  assert.equal(balanceWords(-63526, 'card'), '$635.26 in credit')
  assert.equal(balanceWords(63526, 'card'), '$635.26 owed')
  assert.equal(balanceWords(-500, 'cash'), formatCents(-500))
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

test('catchup: a suggested amount only flags the same place on the same day, a typed one any lookalike', () => {
  const coffee = row('2026-11-14', 540, { what: 'Starbucks', from_id: CARD })
  const fee = row('2026-11-15', 540, { what: 'Annual fee', from_id: CARD })
  const none = () => false
  const line = (date: string) => ({ date, amount: 540, what: 'starbucks' })
  // Copied from Nov 14's coffee, dated Nov 16: the amount was copied, so it's no evidence (nor is the fee's).
  assert.equal(duplicateOf([coffee, fee], line('2026-11-16'), CARD, none, true), null)
  // The same place on the same day is still the likely duplicate.
  assert.equal(duplicateOf([coffee], line('2026-11-14'), CARD, none, true)?.id, coffee.id)
  // Typed, any entry of that amount within a few days counts, unless the session added or took it back.
  assert.equal(duplicateOf([coffee, fee], line('2026-11-16'), CARD, none)?.id, coffee.id)
  assert.equal(duplicateOf([coffee, fee], line('2026-11-16'), CARD, (id) => id === coffee.id)?.id, fee.id)
})

test('catchup: session rows survive a list fetched before they went in, and an Undo drops them at once', () => {
  const old = row('2026-11-10', 100, { from_id: CHK })
  const x = { ...row('2026-11-12', 250, { from_id: CHK }), by: 3 } // added while version 3 was on its way
  // Version 3 (the fetch already going when it was added) lacks it: still in.
  assert.deepEqual(sessionRows([x], [old], 3, new Set()).live.map((r) => r.id), [x.id])
  assert.deepEqual(sessionRows([x], [old], 3, new Set()).rows?.map((r) => r.id), [old.id, x.id])
  // A later list without it means it was deleted elsewhere.
  assert.deepEqual(sessionRows([x], [old], 4, new Set()).live, [])
  // Taken back with Undo: gone from the rows too, though a list fetched before the Undo still has it.
  const r = sessionRows([x], [old, x], 4, new Set([x.id]))
  assert.deepEqual([r.live, r.rows?.map((y) => y.id)], [[], [old.id]])
  // No full list yet: the session's own rows.
  assert.deepEqual(sessionRows([x], undefined, 0, new Set()), { rows: null, live: [x] })
})

test('catchup: the balance after a line counts it as money out until a category says otherwise', () => {
  const chk = acct(CHK, 'cash', 10000)
  const rows = [row('2026-11-01', 2500, { from_id: CHK }), row('2026-11-05', 700, { from_id: CHK })]
  const pay = { date: '2026-11-02', from_id: null, to_id: CHK, amount: 1000 }
  assert.equal(balanceAfter(chk, rows, '2026-10-01', pay, false), 10000 - 2500 - 1000)
  assert.equal(balanceAfter(chk, rows, '2026-10-01', pay, true), 10000 - 2500 + 1000)
  assert.equal(balanceAfter(acct(9, 'loan'), rows, '2026-10-01', pay, true), null)
})

test('catchup: a loan payment picked on a card goes out, one on the loan comes in', () => {
  assert.deepEqual(sides('Loan', CARD, hintFor([], card, 9, 'Loan', blankSides)), { from_id: CARD, to_id: null })
  assert.deepEqual(sides('Transfer', 4, hintFor([], acct(4, 'loan'), 8, 'Transfer', blankSides)), { from_id: null, to_id: 4 })
})

test('caught-up: a matching reconcile marks the account, and its Undo puts the old time back', () => {
  const was = new Date(2026, 10, 1, 8)
  markCaughtUp(7, was)
  const before = markCaughtUp(7, new Date(2026, 10, 20, 9))
  assert.equal(before, was.toISOString())
  unmarkCaughtUp(7, before)
  assert.equal(useCaughtUp.getState().at['7'], was.toISOString())
  unmarkCaughtUp(8, markCaughtUp(8)) // never caught up before: back to never
  assert.equal(useCaughtUp.getState().at['8'], undefined)
})
