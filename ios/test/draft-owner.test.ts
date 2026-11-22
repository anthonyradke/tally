import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blank, useDraft } from '@/lib/draft'
import { keeper } from '@/lib/draftOwner'

const reset = (what: string, owner: string, date = '2026-11-22', more = {}) => useDraft.getState().reset({ ...blank(date), what, ...more }, owner)

test('draft owner: a screen opened over another and closed gives the one underneath its draft back', () => {
  const under = keeper('catchup', 'route-a')
  const stop = under.watch()
  reset('', 'catchup')
  useDraft.getState().set({ what: 'Half typed' }) // typed after the reset: kept too
  // The editor opened from "N added" seeds its own draft as it mounts, before the screen underneath hears it's blurred.
  const over = keeper('entry', 'route-b')
  const stopOver = over.watch()
  reset('ATM withdrawal', 'entry', '2026-11-21', { id: 9, amount: '60' })
  over.focus()
  stopOver() // closed
  under.focus()
  const s = useDraft.getState()
  assert.equal(s.owner, 'catchup')
  assert.equal(s.d.what, 'Half typed')
  assert.equal(s.d.date, '2026-11-22')
  assert.equal(s.d.id, undefined)
  stop()
})

test('draft owner: a picker sheet that only edits the draft keeps its changes', () => {
  const k = keeper('editor', 'route-c')
  const stop = k.watch()
  reset('Costco', 'editor')
  useDraft.getState().set({ category_id: 4 }) // the category sheet, while the editor is covered
  k.focus()
  assert.equal(useDraft.getState().d.category_id, 4)
  assert.equal(useDraft.getState().d.what, 'Costco')
  stop()
})

test('draft owner: in one screen, only the part that had the draft last takes it back', () => {
  const composer = keeper('composer', 'route-d')
  const embedded = keeper('embedded', 'route-d') // Catch up as one of the composer's pages
  const stops = [composer.watch(), embedded.watch()]
  reset('Composer line', 'composer')
  reset('Catch-up line', 'embedded', '2026-11-20')
  for (const order of [[composer, embedded], [embedded, composer]]) {
    reset('Opened row', 'entry2', '2026-11-19')
    order.forEach((k) => k.focus())
    assert.equal(useDraft.getState().owner, 'embedded')
    assert.equal(useDraft.getState().d.what, 'Catch-up line')
  }
  stops.forEach((s) => s())
})
