// The offline outbox against a fake server: order, retries, refusals, dedupe, persistence.
import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import storage from '@react-native-async-storage/async-storage'
import { api, ApiError, unreachable, type TxnInput } from '@/lib/api'
import { blockedText, discard, enqueue, flush, loadOutbox, newClientId, outboxEntry, QUEUED, QUEUED_TOKEN, queuedText, sendNow, sendOrQueue, useOutbox } from '@/lib/outbox'
import { useServer } from '@/lib/server'

const line = (amount: number): TxnInput => ({ date: '2026-09-24', what: 'x', category_id: 2, from_id: 1, to_id: null, amount })
const offline = () => new TypeError('Network request failed')
let sent: { cid: string; lines: number }[]
let answer: (cid: string) => unknown

beforeEach(() => {
  ;(storage as unknown as { clear(): void }).clear()
  useOutbox.setState({ items: [], blocked: null })
  sent = []
  answer = () => ({})
  api.createTxn = async (_t, cid) => { sent.push({ cid: cid!, lines: 1 }); const a = answer(cid!); if (a instanceof Error) throw a; return a as never }
  api.createSplit = async (l, cid) => { sent.push({ cid: cid!, lines: l.length }); const a = answer(cid!); if (a instanceof Error) throw a; return a as never }
})

test('flush sends oldest first, one request per entry, splits as one', async () => {
  enqueue({ cid: 'a', lines: [line(1)], label: 'A' })
  enqueue({ cid: 'b', lines: [line(2), line(3)], label: 'B' })
  enqueue({ cid: 'c', lines: [line(4)], label: 'C' })
  assert.equal(await flush(), 3)
  assert.deepEqual(sent, [{ cid: 'a', lines: 1 }, { cid: 'b', lines: 2 }, { cid: 'c', lines: 1 }])
  assert.deepEqual(useOutbox.getState().items, [])
})

test('still offline: stop at the first failure and keep everything', async () => {
  enqueue({ cid: 'a', lines: [line(1)], label: 'A' })
  enqueue({ cid: 'b', lines: [line(2)], label: 'B' })
  answer = () => offline()
  assert.equal(await flush(), 0)
  assert.deepEqual(sent.map((s) => s.cid), ['a'])
  assert.deepEqual(useOutbox.getState().items.map((q) => [q.cid, q.error]), [['a', undefined], ['b', undefined]])
})

test('a refusal stays queued with its reason; the rest still send', async () => {
  enqueue({ cid: 'a', lines: [line(1)], label: 'A' })
  enqueue({ cid: 'b', lines: [line(2)], label: 'B' })
  answer = (cid) => (cid === 'a' ? new ApiError(422, ['Pick a category.']) : {})
  assert.equal(await flush(), 1)
  assert.deepEqual(useOutbox.getState().items.map((q) => [q.cid, q.error]), [['a', 'Pick a category.']])
  discard('a')
  assert.deepEqual(useOutbox.getState().items, [])
})

test('a server hiccup (502/503/504) counts as offline, a 500 as a refusal', async () => {
  for (const status of [502, 503, 504]) assert.ok(unreachable(new ApiError(status, [])), String(status))
  assert.ok(!unreachable(new ApiError(500, [])) && !unreachable(new ApiError(422, [])) && !unreachable(new ApiError(404, [])))
  const abort = new Error('Aborted'); abort.name = 'AbortError'
  assert.ok(unreachable(abort) && unreachable(offline()))
})

test('two flushes at once send each entry once', async () => {
  enqueue({ cid: 'a', lines: [line(1)], label: 'A' })
  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  api.createTxn = async (_t, cid) => { sent.push({ cid: cid!, lines: 1 }); await gate; return {} as never }
  const one = flush(), two = flush()
  assert.equal(one, two)
  release()
  assert.equal(await one, 1)
  assert.equal(sent.length, 1)
})

test('an entry queued while a flush runs waits for the next one', async () => {
  enqueue({ cid: 'a', lines: [line(1)], label: 'A' })
  api.createTxn = async (_t, cid) => { sent.push({ cid: cid!, lines: 1 }); if (cid === 'a') enqueue({ cid: 'b', lines: [line(2)], label: 'B' }); return {} as never }
  assert.equal(await flush(), 1)
  assert.deepEqual(useOutbox.getState().items.map((q) => q.cid), ['b'])
  assert.equal(await flush(), 1)
})

test('enqueue replaces an entry with the same client id', () => {
  enqueue({ cid: 'a', lines: [line(1)], label: 'first' })
  enqueue({ cid: 'a', lines: [line(2)], label: 'second' })
  assert.deepEqual(useOutbox.getState().items.map((q) => q.label), ['second'])
})

test('the queue survives a restart, and a corrupt one starts empty', async () => {
  enqueue({ cid: 'a', lines: [line(1)], label: 'A' })
  await new Promise((r) => setTimeout(r, 0))
  useOutbox.setState({ items: [] })
  await loadOutbox()
  assert.deepEqual(useOutbox.getState().items.map((q) => q.cid), ['a'])
  await storage.setItem('tally.outbox', '{not json')
  useOutbox.setState({ items: [] })
  await loadOutbox()
  assert.deepEqual(useOutbox.getState().items, [])
})

test('client ids fit the server pattern', () => {
  const ids = new Set<string>()
  for (let i = 0; i < 1000; i++) {
    const id = newClientId()
    assert.match(id, /^[A-Za-z0-9-]{8,64}$/)
    ids.add(id)
  }
  assert.equal(ids.size, 1000)
  const saved = globalThis.crypto
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
  try { assert.match(newClientId(), /^[A-Za-z0-9-]{8,64}$/) } finally { Object.defineProperty(globalThis, 'crypto', { value: saved, configurable: true }) }
})

test('discarding one while an earlier one is sending keeps it from going', async () => {
  enqueue({ cid: 'a', lines: [line(1)], label: 'A' })
  enqueue({ cid: 'b', lines: [line(2)], label: 'B' })
  api.createTxn = async (_t, cid) => { sent.push({ cid: cid!, lines: 1 }); if (cid === 'a') discard('b'); return {} as never }
  assert.equal(await flush(), 1)
  assert.deepEqual(sent.map((s) => s.cid), ['a'])
})

test('a refused entry waits for Send now; a refused token keeps everything queued', async () => {
  enqueue({ cid: 'a', lines: [line(1)], label: 'A' })
  answer = () => new ApiError(422, ['Pick a category.'])
  await flush()
  sent = []
  answer = () => ({})
  assert.equal(await flush(), 0) // the every-20-seconds flush skips it
  assert.equal(sent.length, 0)
  assert.equal(await flush(true), 1) // Send now tries it again
  enqueue({ cid: 'b', lines: [line(2)], label: 'B' })
  answer = () => new ApiError(401, ['Tally wants its token.'])
  assert.equal(await flush(), 0)
  assert.deepEqual(useOutbox.getState().items.map((q) => [q.cid, q.error]), [['b', undefined]])
})

test('why entries wait: a refused token is told apart from being offline', async () => {
  enqueue({ cid: 'a', lines: [line(1)], label: 'A' })
  answer = () => new ApiError(403, ['Not this login.'])
  await flush()
  assert.equal(useOutbox.getState().blocked, 'token')
  assert.match(blockedText('token')!, /token/i)
  answer = () => offline()
  await flush()
  assert.equal(useOutbox.getState().blocked, 'offline')
  answer = () => ({})
  await flush()
  assert.equal(useOutbox.getState().blocked, null)
  assert.equal(blockedText(null), null)
})

test('sendOrQueue keeps an entry on a refused token and says to check it', async () => {
  answer = () => new ApiError(401, ['Tally wants its token.'])
  assert.equal(await sendOrQueue([line(5)], 'Tea'), null)
  assert.equal(queuedText(), QUEUED_TOKEN)
  answer = () => offline()
  assert.equal(await sendOrQueue([line(5)], 'Tea'), null)
  assert.equal(queuedText(), QUEUED)
  assert.equal(useOutbox.getState().items.length, 2)
  answer = () => new ApiError(422, ['Pick a category.'])
  await assert.rejects(sendOrQueue([line(5)], 'Tea'))
})

test('outbox entries for Settings: amounts, dates, reasons, and ones for another address', () => {
  useServer.setState({ url: 'https://a.test' })
  enqueue({ cid: 'a', lines: [{ ...line(1200), date: '2026-11-20', what: 'Lunch' }, line(300)], label: 'Lunch' })
  const [q] = useOutbox.getState().items
  assert.deepEqual(outboxEntry({ ...q, error: 'Pick a category.' }, 'https://a.test'),
    { cid: 'a', what: 'Lunch', amount: 1500, date: '2026-11-20', saved: q.at, lines: 2, error: 'Pick a category.', elsewhere: false })
  assert.equal(outboxEntry(q, 'https://b.test').elsewhere, true)
  useServer.setState({ url: '' })
})

test('Send now retries refused entries and reports what happened', async () => {
  enqueue({ cid: 'a', lines: [line(1)], label: 'A' })
  enqueue({ cid: 'b', lines: [line(2)], label: 'B' })
  answer = (cid) => (cid === 'a' ? new ApiError(422, ['Pick a category.']) : new ApiError(422, ['Too big.']))
  await flush()
  answer = (cid) => (cid === 'a' ? {} : new ApiError(422, ['Too big.']))
  assert.deepEqual(await sendNow(), { sent: 1, failed: 1, blocked: null })
  assert.deepEqual(useOutbox.getState().items.map((q) => [q.cid, q.error]), [['b', 'Too big.']])
})

test('Send now during a running flush still retries refused entries', async () => {
  enqueue({ cid: 'a', lines: [line(1)], label: 'A' })
  answer = () => new ApiError(422, ['Pick a category.'])
  await flush()
  answer = () => ({})
  enqueue({ cid: 'b', lines: [line(2)], label: 'B' })
  const auto = flush()
  const now = sendNow()
  assert.equal(await auto, 1)
  assert.deepEqual(await now, { sent: 1, failed: 0, blocked: null })
  assert.deepEqual(useOutbox.getState().items, [])
})
