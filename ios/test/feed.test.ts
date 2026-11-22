import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CatType, Txn } from '@/lib/api'
import { accountSide, feedItems, selectedTotal, type FeedOptions } from '@/lib/feed'
import { row } from './fixtures.ts'

const typeOf = (t: Txn): CatType => (t.category_id === 1 ? 'Money in' : 'Spending')
const o: FeedOptions = { byAmount: false, fold: false, showSched: false, exact: 0, today: '2026-11-20', typeOf }
const kinds = (items: ReturnType<typeof feedItems>) => items.map((i) => (i.kind === 'row' ? `r${i.t.amount}` : i.kind === 'head' ? `h${i.date.slice(8)}:${i.spent}` : i.kind === 'label' ? i.text : `s${i.count}`))

test('feed: day headers with the day spending, scheduled rows folded at the top', () => {
  const rows = [row('2026-12-01', 1400), row('2026-11-20', 500), row('2026-11-20', 300, { category_id: 1 }), row('2026-11-19', 50)]
  assert.deepEqual(kinds(feedItems(rows, o)), ['h01:1400', 'r1400', 'h20:500', 'r500', 'r300', 'h19:50', 'r50'])
  assert.deepEqual(kinds(feedItems(rows, { ...o, fold: true })), ['s1', 'h20:500', 'r500', 'r300', 'h19:50', 'r50'])
  assert.deepEqual(kinds(feedItems(rows, { ...o, fold: true, showSched: true })).slice(0, 3), ['s1', 'h01:1400', 'r1400'])
  assert.deepEqual(kinds(feedItems(rows, { ...o, byAmount: true })), ['r1400', 'r500', 'r300', 'r50'])
})

test('feed: a search for an amount puts the exact ones first under their own heading, keys apart', () => {
  const rows = [row('2026-11-20', 6500), row('2026-11-20', 600), row('2026-11-18', 650)]
  const items = feedItems([rows[1], rows[0], rows[2]], { ...o, exact: 1 })
  assert.deepEqual(kinds(items), ['Exact amount', 'h20:600', 'r600', 'More matches', 'h20:6500', 'r6500', 'h18:650', 'r650'])
  assert.equal(new Set(items.map((i) => i.key)).size, items.length)
  // All of them exact, or none: no headings.
  assert.deepEqual(kinds(feedItems(rows.slice(0, 1), { ...o, exact: 1 })), ['h20:6500', 'r6500'])
})

test('selection: the total nets refunds and money in, and the side an account change works on', () => {
  const spend = row('2026-11-20', 5000), refund = row('2026-11-20', -1200), pay = row('2026-11-20', 300000, { category_id: 1 })
  assert.equal(selectedTotal([spend, refund], typeOf), 3800)
  assert.equal(selectedTotal([pay], typeOf), -300000)
  assert.equal(accountSide([spend, refund], typeOf), 'from')
  assert.equal(accountSide([pay], typeOf), 'to')
  assert.equal(accountSide([spend, pay], typeOf), 'either')
})
