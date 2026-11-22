// Delete with Undo, the way the rows' menus and multi-select use it, against a fake server.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { api, ApiError, type Txn } from '@/lib/api'
import { deleteTxns, openAdded } from '@/lib/actions'
import { useToast } from '@/lib/toast'
import { row } from './fixtures.ts'

test('undo that fails says so instead of doing nothing', async () => {
  const t: Txn = row('2026-09-24', 1250, { what: 'Coffee' })
  api.deleteTxn = async () => t
  await deleteTxns([t])
  const shown = useToast.getState().toast!
  assert.equal(shown.text, 'Deleted Coffee, $12.50')
  api.restore = async () => { throw new TypeError('Network request failed') }
  await shown.action!.run() // must not reject: the toast's button awaits it with nothing to catch
  const after = useToast.getState().toast!
  assert.equal(after.tone, 'error')
  assert.match(after.text, /undo/i)
  api.restore = async () => { throw new ApiError(409, ['That entry is already back.']) }
  await shown.action!.run()
  assert.equal(useToast.getState().toast!.text, 'That entry is already back.')
})

test('openAdded: an entry opens itself, a split opens its lines together in Activity', async () => {
  const { router } = await import('expo-router')
  const pushed: unknown[] = []
  const push = router.push
  router.push = ((to: unknown) => { pushed.push(to) }) as typeof router.push
  try {
    const one = row('2026-11-20', 4299, { what: 'Amazon' })
    openAdded([one])!()
    assert.deepEqual(pushed.pop(), { pathname: '/entry', params: { id: String(one.id) } })
    const lines = [row('2026-11-20', 8000, { split_group: 'g1' }), row('2026-11-20', 4000, { split_group: 'g1' })]
    openAdded(lines)!()
    assert.deepEqual(pushed.pop(), { pathname: '/activity', params: { group: 'g1' } })
    assert.equal(openAdded([]), undefined)
  } finally {
    router.push = push
  }
})
