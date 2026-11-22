// Select mode on Activity: what a selection may act on, its total, and the side an account change sets.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CatType, Txn } from '@/lib/api'
import { feedItems, hidesAhead, pickedRows, selectable, selectedTotal, sideOf, type FeedOptions } from '@/lib/feed'
import { row } from './fixtures.ts'

const today = '2026-11-20'
const typeOf = (t: Txn): CatType => (t.category_id === 1 ? 'Money in' : t.category_id === 3 ? 'Transfer' : 'Spending')
const o: FeedOptions = { byAmount: false, fold: true, showSched: false, exact: 0, today, typeOf }

test('select: the scheduled rows under a closed fold are out of sight, so Select all leaves them out', () => {
  const bill = row('2026-12-01', 140000), coffee = row('2026-11-20', 500), lunch = row('2026-11-19', 1500)
  const rows = [bill, coffee, lunch]
  assert.ok(hidesAhead(rows, o))
  assert.ok(!hidesAhead(rows, { ...o, showSched: true }) && !hidesAhead(rows, { ...o, fold: false }))
  // Every match but the folded one; unknown while only folded rows have loaded and more pages wait.
  assert.equal(selectable(300, 3, 2, true), 299)
  assert.equal(selectable(300, 100, 0, true), null)
  assert.equal(selectable(100, 100, 0, false), 0)
  assert.equal(selectable(300, 100, 100, true), 300)
  // A bill Select all fetched while the fold was open drops out once it closes.
  assert.deepEqual(pickedRows(new Set([bill.id, coffee.id]), [coffee, lunch], [bill, coffee], true, today), [coffee])
  assert.deepEqual(pickedRows(new Set([bill.id, coffee.id]), [bill, coffee, lunch], [], false, today), [bill, coffee])
})

test('select: only rows in sight or fetched for these filters are acted on', () => {
  const a = row('2026-11-18', 100), b = row('2026-11-17', 200), gone = row('2026-11-16', 300)
  // `gone` was picked under an earlier search and isn't in the list or the fetched matches any more.
  assert.deepEqual(pickedRows(new Set([a.id, b.id, gone.id]), [a], [b], false, today).map((r) => r.id), [a.id, b.id])
  // The loaded copy wins over the fetched one (it's the fresher).
  const moved = { ...a, category_id: 1 }
  assert.equal(pickedRows(new Set([a.id]), [moved], [a], false, today)[0].category_id, 1)
})

test('select: the total leaves transfers out, and a mix of spending and money in changes each row its own side', () => {
  const coffee = row('2026-11-20', 2000), move = row('2026-11-20', 50000, { category_id: 3 }), pay = row('2026-11-20', 300000, { category_id: 1 })
  assert.equal(selectedTotal([coffee, move], typeOf), 2000)
  assert.equal(selectedTotal([move], typeOf), 0)
  assert.equal(selectedTotal([coffee, pay], typeOf), -298000)
  assert.equal(sideOf('either', 'Money in'), 'to')
  assert.equal(sideOf('either', 'Spending'), 'from')
  assert.equal(sideOf('either', 'Transfer'), 'from')
  assert.equal(sideOf('to', 'Transfer'), 'to')
})

test('feed: exact amounts keep their heading while the rest of the matches are still to load', () => {
  const rows = [row('2026-11-20', 600), row('2026-11-19', 600)]
  const kinds = feedItems(rows, { ...o, fold: false, exact: 2, total: 5 }).map((i) => i.kind === 'label' ? i.text : i.kind)
  assert.deepEqual(kinds, ['Exact amount', 'head', 'row', 'head', 'row'])
})
