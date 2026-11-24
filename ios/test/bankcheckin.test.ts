// When opening Tally brings up New from the bank: only when something waits, once on the first open of the day, and
// again whenever a row has come in since the last look. Each server remembers its own last look.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import storage from '@react-native-async-storage/async-storage'
import { loadSeen, newestId, saveSeen, shouldCheckIn } from '@/lib/bank'
import { useServer } from '@/lib/server'

const r = (id: number, pending = false) => ({ id, pending })

test('nothing waiting: no check-in', () => {
  assert.equal(shouldCheckIn([], 0, null, '2026-11-24'), false)
  assert.equal(shouldCheckIn([r(9, true)], 0, null, '2026-11-24'), false) // pending only
})

test('first open of the day, then only when something new comes in', () => {
  const rows = [r(3), r(5), r(8, true)]
  assert.equal(shouldCheckIn(rows, 0, null, '2026-11-24'), true)
  const seen = { day: '2026-11-24', maxId: newestId(rows) }
  assert.equal(seen.maxId, 5)
  assert.equal(shouldCheckIn(rows, 0, seen, '2026-11-24'), false)
  assert.equal(shouldCheckIn([...rows, r(6)], 0, seen, '2026-11-24'), true)
  assert.equal(shouldCheckIn(rows, 0, seen, '2026-11-25'), true)
})

test('an account to place counts as waiting', () => {
  assert.equal(shouldCheckIn([], 1, null, '2026-11-24'), true)
  assert.equal(shouldCheckIn([], 1, { day: '2026-11-24', maxId: 0 }, '2026-11-24'), false)
})

test('Tally and Lab keep their own last look', async () => {
  ;(storage as unknown as { clear(): void }).clear()
  useServer.setState({ profile: 'lab' })
  await saveSeen({ day: '2026-11-24', maxId: 40 })
  assert.deepEqual(await loadSeen(), { day: '2026-11-24', maxId: 40 })
  useServer.setState({ profile: 'tally' })
  assert.equal(await loadSeen(), null)
})
