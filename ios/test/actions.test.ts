// Delete with Undo, the way the rows' menus and multi-select use it, against a fake server.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { api, ApiError, type Txn } from '@/lib/api'
import { deleteTxns } from '@/lib/actions'
import { useToast } from '@/lib/toast'
import { row } from './fixtures.ts'

test('undo that fails says so instead of doing nothing', async () => {
  const t: Txn = row('2026-09-24', 1250, { what: 'Coffee' })
  api.deleteTxn = async () => t
  await deleteTxns([t])
  const shown = useToast.getState().toast!
  assert.equal(shown.text, 'Deleted Coffee')
  api.restore = async () => { throw new TypeError('Network request failed') }
  await shown.action!.run() // must not reject: the toast's button awaits it with nothing to catch
  const after = useToast.getState().toast!
  assert.equal(after.tone, 'error')
  assert.match(after.text, /undo/i)
  api.restore = async () => { throw new ApiError(409, ['That entry is already back.']) }
  await shown.action!.run()
  assert.equal(useToast.getState().toast!.text, 'That entry is already back.')
})
