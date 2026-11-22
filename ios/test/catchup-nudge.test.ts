import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MIN_PER_MONTH, rhythmOf, staleAccounts, suggestCatchUp, useCaughtUp } from '@/lib/caughtUp'
import { addDays } from '@/lib/dates'

const TODAY = '2026-11-22'
const now = new Date(2026, 10, 22, 9)
/** Entry dates every `step` days back from `newest`, `n` of them, oldest first. */
const every = (step: number, n: number, newest: string) => Array.from({ length: n }, (_, i) => addDays(newest, -step * (n - 1 - i)))

test('caught-up: an account\'s rhythm is its entries a month and the median days between them', () => {
  const daily = rhythmOf(every(1, 90, TODAY), TODAY)
  assert.equal(daily.gap, 1)
  assert.ok(daily.perMonth > 29 && daily.perMonth < 31)
  const monthly = rhythmOf(every(30, 6, '2026-11-01'), TODAY)
  assert.equal(monthly.gap, 30)
  assert.ok(monthly.perMonth < MIN_PER_MONTH)
  // A new account, three weeks old: counted over a month at least, not blown up to a high rate.
  assert.ok(rhythmOf(every(7, 3, '2026-11-20'), TODAY).perMonth < 3.1)
  // Scheduled rows don't count, and nothing posted is no rhythm.
  assert.deepEqual(rhythmOf(['2026-12-01'], TODAY), { perMonth: 0, gap: null })
})

test('caught-up: savings with one transfer a month is never nudged, caught up or not', () => {
  const monthly = { 3: rhythmOf(every(30, 6, '2026-11-01'), TODAY) }
  assert.deepEqual(staleAccounts({}, [3], now, { 3: '2026-11-01' }, monthly), [])
  const at = { 3: new Date(2026, 10, 1, 9).toISOString() }
  assert.deepEqual(staleAccounts(at, [3], now, { 3: '2026-11-01' }, monthly), [])
  // Without a rhythm (entries not loaded), the plain rule still applies.
  assert.deepEqual(staleAccounts(at, [3], now, { 3: '2026-11-01' }), [{ id: 3, days: 21 }])
})

test('caught-up: an account is behind after half again its usual gap, and never under the plain rule', () => {
  // Entries once a week: behind after 11 days, not 9.
  const weekly = { 5: rhythmOf(every(7, 14, '2026-11-15'), TODAY) }
  assert.equal(weekly[5].gap, 7)
  const at = (d: number) => ({ 5: new Date(2026, 10, 22 - d, 9).toISOString() })
  assert.deepEqual(staleAccounts(at(10), [5], now, {}, weekly), [])
  assert.deepEqual(staleAccounts(at(11), [5], now, {}, weekly), [{ id: 5, days: 11 }])
  // Daily: the 9-day minimum, and never caught up, a week from its newest entry.
  const daily = { 1: rhythmOf(every(1, 80, '2026-11-14'), TODAY) }
  assert.deepEqual(staleAccounts(at(8), [5], now, {}, { 5: daily[1] }), [])
  assert.deepEqual(staleAccounts(at(9), [5], now, {}, { 5: daily[1] }), [{ id: 5, days: 9 }])
  assert.deepEqual(staleAccounts({}, [1], now, { 1: '2026-11-14' }, daily), [{ id: 1, days: 8, never: true }])
})

test('caught-up: Home stops suggesting an account, and Undo brings it back', () => {
  suggestCatchUp(4, false)
  assert.equal(useCaughtUp.getState().off['4'], true)
  suggestCatchUp(4, true)
  assert.equal(useCaughtUp.getState().off['4'], undefined)
})
