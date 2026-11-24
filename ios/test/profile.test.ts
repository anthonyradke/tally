// Tally and Tally Lab on one phone: each server keeps its own outbox and cache, and switching never carries one
// server's queued entries or data over to the other.
import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import storage from '@react-native-async-storage/async-storage'
import { api, type TxnInput , Account } from '@/lib/api'
import { bankFigure } from '@/lib/bank'
import { queryClient } from '@/lib/data'
import { enqueue, flush, useOutbox } from '@/lib/outbox'
import { switchProfile } from '@/lib/profile'
import { keyFor, scoped, useServer } from '@/lib/server'

const line = (amount: number): TxnInput => ({ date: '2026-09-24', what: 'x', category_id: 2, from_id: 1, to_id: null, amount })
let sent: string[]

beforeEach(async () => {
  ;(storage as unknown as { clear(): void }).clear()
  useServer.setState({ profile: 'tally', url: 'https://real.test', token: '' })
  await storage.setItem('tally.server', 'https://real.test')
  useOutbox.setState({ items: [] })
  sent = []
  api.createTxn = async (_t, cid) => { sent.push(`${useServer.getState().url} ${cid}`); return {} as never }
})

test('the real Tally keeps its old storage names; Lab gets its own', () => {
  assert.equal(keyFor('tally.outbox', 'tally'), 'tally.outbox')
  assert.equal(keyFor('tally.outbox', 'lab'), 'tally.outbox@lab')
  useServer.setState({ profile: 'lab' })
  assert.equal(scoped('tally.cache'), 'tally.cache@lab')
})

test("switching to Lab leaves the real outbox behind and never sends it to Lab", async () => {
  enqueue({ cid: 'real-1', lines: [line(100)], label: 'Real' })
  await storage.setItem('tally.server@lab', 'https://lab.test')
  await switchProfile('lab')
  assert.equal(useServer.getState().url, 'https://lab.test')
  assert.deepEqual(useOutbox.getState().items, [])
  enqueue({ cid: 'lab-1', lines: [line(200)], label: 'Lab' })
  await flush()
  assert.deepEqual(sent, ['https://lab.test lab-1'])
  await switchProfile('tally')
  assert.deepEqual(useOutbox.getState().items.map((q) => q.cid), ['real-1'])
  await flush()
  assert.deepEqual(sent, ['https://lab.test lab-1', 'https://real.test real-1'])
})

test('an entry queued for one address is never sent to another', async () => {
  enqueue({ cid: 'a', lines: [line(1)], label: 'A' })
  useServer.setState({ url: 'https://moved.test' })
  assert.equal(await flush(), 0)
  assert.deepEqual(sent, [])
})

test('switching empties the query cache', async () => {
  queryClient.setQueryData(['bootstrap'], { today: '2026-09-24' })
  await switchProfile('lab')
  assert.equal(queryClient.getQueryData(['bootstrap']), undefined)
})

test('bank rows read like the account statement', () => {
  const cash = { kind: 'cash' } as Account
  const card = { kind: 'card' } as Account
  assert.deepEqual(bankFigure({ amount: 500 }, cash), { text: 500, sign: 'minus' })
  assert.deepEqual(bankFigure({ amount: 500 }, card), { text: 500, sign: 'plain' })
  assert.deepEqual(bankFigure({ amount: -500 }, card), { text: 500, sign: 'plus' })
})
