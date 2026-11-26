// Deleting an entry (named notice, a second tap ignored, Undo), hiding a logo (kept across launches) and an action
// that fails saying so.
import { after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import storage from '@react-native-async-storage/async-storage'
import { api, ApiError, type Txn } from '@/lib/api'
import { queryClient } from '@/lib/data'
import { deleteEntry, hideLogo, loadLogoEpoch, useLogoEpoch } from '@/design/actions'
import { reasonOf, runAction, useNotice } from '@/design/notify'
import { row } from './fixtures.ts'

beforeEach(() => { queryClient.clear(); useNotice.setState({ note: null }) })
after(() => queryClient.clear())
api.bank.status = async () => { throw new ApiError(404, ['Not Found']) }

test('a delete names the entry, ignores a second tap meanwhile, and Undo puts it back', async () => {
  const t = row('2026-11-20', 4200, { what: 'Costco' })
  let deletes = 0
  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  api.deleteTxn = async () => { deletes++; await gate; return t }
  const restored: Txn[][] = []
  api.restore = async (rows) => { restored.push(rows); return rows }
  const one = deleteEntry(t)
  const two = deleteEntry(t) // the swipe action tapped again
  release()
  await Promise.all([one, two])
  assert.equal(deletes, 1)
  const note = useNotice.getState().note!
  assert.equal(note.text, 'Deleted Costco')
  await deleteEntry(t) // still on screen until the lists refresh
  assert.equal(deletes, 1)
  await runAction(note)
  assert.deepEqual(restored, [[t]])
})

test('a failed delete says why; a failed Undo says so instead of nothing', async () => {
  const t = row('2026-11-20', 100, { what: 'Tea' })
  api.deleteTxn = async () => { throw new ApiError(409, ['That entry is locked.']) }
  await deleteEntry(t)
  assert.equal(useNotice.getState().note?.text, 'That entry is locked.')
  await runAction({ id: 0, text: 'Deleted', action: { label: 'Undo', run: async () => { throw new TypeError('Network request failed') } } })
  assert.equal(useNotice.getState().note?.text, "Couldn't undo")
  await runAction({ id: 0, text: 'Deleted', action: { label: 'Undo', run: async () => { throw new ApiError(409, ['Already back.']) } } })
  assert.equal(useNotice.getState().note?.text, 'Already back.')
  assert.equal(reasonOf(new ApiError(404, ['Not Found']), 'x'), 'x')
  assert.equal(reasonOf(new ApiError(502, ['Tally did not answer.']), 'x'), 'x')
})

test('hiding a logo bumps the epoch, keeps it on the phone and refreshes brand colors', async () => {
  api.hideLogo = async () => undefined
  queryClient.setQueryData(['logo-color', '', 'name', 'costco'], { color: '#E31837' })
  const before = useLogoEpoch.getState().n
  await hideLogo('Costco')
  assert.equal(useLogoEpoch.getState().n, before + 1)
  assert.equal(queryClient.getQueryState(['logo-color', '', 'name', 'costco'])?.isInvalidated, true)
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(await storage.getItem('tally.logoEpoch'), String(before + 1))
  useLogoEpoch.setState({ n: 0 }) // a new launch
  await loadLogoEpoch()
  assert.equal(useLogoEpoch.getState().n, before + 1)
})
