// The API client against a fake fetch: how answers become data, refusals or "unreachable".
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { api, ApiError, unreachable } from '@/lib/api'
import { useServer } from '@/lib/server'

const realFetch = globalThis.fetch
let calls: { url: string; init: RequestInit }[] = []
function respond(status: number, body: unknown, type = 'application/json') {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const text = typeof body === 'string' ? body : JSON.stringify(body)
    return new Response(status === 204 ? null : text, { status, headers: { 'content-type': type } })
  }) as typeof fetch
}
afterEach(() => { globalThis.fetch = realFetch; calls = [] })
useServer.setState({ url: 'https://tally.test' })

test('amounts go out in dollars, with the client id', async () => {
  respond(201, { id: 1 })
  await api.createTxn({ date: '2026-09-24', what: 'x', category_id: 2, from_id: 1, to_id: null, amount: 1234 }, 'abc12345')
  const body = JSON.parse(String(calls[0].init.body))
  assert.equal(calls[0].url, 'https://tally.test/api/transactions')
  assert.equal(body.amount, 12.34)
  assert.equal(body.client_id, 'abc12345')
})

test('every cent amount survives the trip as dollars', () => {
  for (let c = -100000; c <= 100000; c += 7) assert.equal(Math.round(JSON.parse(JSON.stringify(c / 100)) * 100), c)
})

test('refusals carry the server message', async () => {
  respond(422, { detail: { errors: ['Pick a category.', 'From is required.'] } })
  await assert.rejects(api.transactions(), (e: unknown) => e instanceof ApiError && e.status === 422 && e.errors.length === 2 && !unreachable(e))
  respond(404, { detail: 'Not Found' })
  await assert.rejects(api.deleteTxn(9), (e: unknown) => e instanceof ApiError && e.errors[0] === 'Not Found')
  respond(500, 'Internal Server Error', 'text/plain')
  await assert.rejects(api.bootstrap(), (e: unknown) => e instanceof ApiError && e.errors[0] === 'Request failed (500)')
})

test('a page that is not Tally counts as unreachable', async () => {
  respond(200, '<html>captive portal</html>', 'text/html')
  await assert.rejects(api.bootstrap(), (e: unknown) => unreachable(e))
})

test('204 is fine and query strings skip empty values', async () => {
  respond(204, null)
  assert.equal(await api.deleteReceipt(3), undefined)
  respond(200, { total: 0, sum: 0, by_type: {}, items: [] })
  await api.transactions({ q: '', type: '', category: 3, start: undefined, tag: 'a b&c' })
  assert.equal(calls.at(-1)!.url, 'https://tally.test/api/transactions?category=3&tag=a+b%26c')
})

test('receipt names are encoded into the URL', () => {
  assert.equal(api.receiptUrl('5-ab.png'), 'https://tally.test/api/receipts/5-ab.png')
  assert.equal(api.receiptUrl('../x'), 'https://tally.test/api/receipts/..%2Fx')
})
