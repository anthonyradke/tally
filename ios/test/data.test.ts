// The query cache: what's kept on the phone, how long searches live, single entries seeded from lists, and the bank
// check-in refreshing everything when a sync changed entries.
import { after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { api, type BankStatus, type TxnPage } from '@/lib/api'
import { freshBank, syncChanged } from '@/lib/bank'
import { cachedTxn, cachedTxnAt, invalidateAll, keepOnPhone, queryClient, SEARCH_GC, searchOf } from '@/lib/data'
import { row } from './fixtures.ts'

const page = (items: ReturnType<typeof row>[]): TxnPage => ({ total: items.length, sum: 0, by_type: {}, exact: 0, items })

beforeEach(() => queryClient.clear())
after(() => queryClient.clear()) // a cached query's garbage-collection timer would keep the test run alive

test('searches are never saved on the phone, whichever list asked', () => {
  assert.equal(keepOnPhone(['transactions', { q: 'coffee' }]), false)
  assert.equal(keepOnPhone(['transactions', 'feed', { q: 'c' }]), false)
  assert.equal(keepOnPhone(['transactions', 'feed', { q: '  ' }]), true)
  assert.equal(keepOnPhone(['transactions', 'feed', { type: 'Spending' }]), true)
  assert.equal(keepOnPhone(['transactions', { what: 'Costco' }]), false)
  assert.equal(keepOnPhone(['transactions', { sort: 'date' }]), true)
  assert.equal(keepOnPhone(['transactions', 'one', 5]), false)
  assert.equal(keepOnPhone(['bootstrap']), true)
  assert.equal(keepOnPhone(['bank', 'inbox']), false)
  assert.equal(searchOf(['transactions', 'feed', { q: ' tea ' }]), 'tea')
  assert.equal(searchOf(['bootstrap']), '')
})

test('a search lives 5 minutes in memory, a plain list a week, an explicit gcTime wins', async () => {
  const gc = (key: unknown[]) => queryClient.getQueryCache().find({ queryKey: key, exact: true })!.gcTime
  await queryClient.fetchQuery({ queryKey: ['transactions', 'feed', { q: 'co' }], queryFn: async () => page([]) })
  await queryClient.fetchInfiniteQuery({ queryKey: ['transactions', 'feed', { q: 'cof' }], queryFn: async () => page([]), initialPageParam: 0 })
  await queryClient.fetchQuery({ queryKey: ['transactions', { sort: 'date' }], queryFn: async () => page([]) })
  await queryClient.fetchQuery({ queryKey: ['transactions', { q: 'x' }], queryFn: async () => page([]), gcTime: 1000 })
  assert.equal(gc(['transactions', 'feed', { q: 'co' }]), SEARCH_GC)
  assert.equal(gc(['transactions', 'feed', { q: 'cof' }]), SEARCH_GC)
  assert.equal(gc(['transactions', { sort: 'date' }]), 1000 * 60 * 60 * 24 * 7)
  assert.equal(gc(['transactions', { q: 'x' }]), 1000)
})

test('a cached entry comes with when its list was fetched, from plain and endless lists', () => {
  const a = row('2026-09-01', 100), b = row('2026-09-02', 200)
  queryClient.setQueryData(['transactions', { sort: 'date' }], page([a]), { updatedAt: 1000 })
  queryClient.setQueryData(['transactions', 'feed', {}], { pages: [page([]), page([b])], pageParams: [0, 1] }, { updatedAt: 2000 })
  queryClient.setQueryData(['transactions', 'one', 99], row('2026-09-03', 1))
  assert.deepEqual(cachedTxnAt(a.id), { row: a, at: 1000 })
  assert.deepEqual(cachedTxnAt(b.id), { row: b, at: 2000 })
  assert.equal(cachedTxn(b.id), b)
  assert.equal(cachedTxnAt(123456), undefined)
})

test('invalidateAll marks bank queries stale too', async () => {
  queryClient.setQueryData(['bank', 'inbox'], [])
  queryClient.setQueryData(['bootstrap'], {})
  await invalidateAll()
  assert.equal(queryClient.getQueryState(['bank', 'inbox'])?.isInvalidated, true)
  assert.equal(queryClient.getQueryState(['bootstrap'])?.isInvalidated, true)
})

test('a sync that added or paired entries refreshes everything; a quiet one does not', async () => {
  assert.equal(syncChanged(null), false)
  assert.equal(syncChanged({ paired: 0 }), false)
  assert.equal(syncChanged({ paired: 0, added: 2 }), true)
  assert.equal(syncChanged({ paired: 1 }), true)

  const status: BankStatus = { env: 'sandbox', items: [], waiting: 0, ask: [] }
  api.bank.status = async () => status
  api.bank.inbox = async () => []
  for (const [answer, stale] of [[{ synced: {}, paired: 0 }, false], [{ synced: {}, paired: 0, added: 3 }, true]] as const) {
    queryClient.setQueryData(['bootstrap'], {})
    api.bank.sync = async () => answer
    assert.ok(await freshBank())
    assert.equal(queryClient.getQueryState(['bootstrap'])?.isInvalidated, stale)
  }
})
