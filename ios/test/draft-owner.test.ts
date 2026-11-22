import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blank, useDraft } from '@/lib/draft'
import { keeper, renew } from '@/lib/draftOwner'

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

test('draft owner: a screen that never had the draft never takes it', () => {
  const k = keeper('bystander', 'route-e')
  const stop = k.watch()
  reset('Editor line', 'entry3')
  k.focus()
  assert.equal(useDraft.getState().owner, 'entry3')
  assert.equal(useDraft.getState().d.what, 'Editor line')
  stop()
})

test('draft owner: renew after an await leaves a screen opened meanwhile its draft, and hands the new one back on return', () => {
  const under = keeper('catchup2', 'route-f')
  const stop = under.watch()
  reset('Amazon', 'catchup2', '2026-11-20', { amount: '42.99' })
  renew({ ...blank('2026-11-20'), what: 'Next line' }, 'catchup2') // still its own: straight into the store
  assert.equal(useDraft.getState().d.what, 'Next line')
  reset('Amazon', 'catchup2', '2026-11-20', { amount: '42.99' })
  // "N added" opens the editor while the Add is still saving.
  const over = keeper('entry4', 'route-g')
  const stopOver = over.watch()
  reset('Costco', 'entry4', '2026-11-19', { id: 7 })
  renew({ ...blank('2026-11-20'), date: '2026-11-20' }, 'catchup2') // the Add lands
  assert.equal(useDraft.getState().owner, 'entry4')
  assert.equal(useDraft.getState().d.what, 'Costco')
  stopOver()
  under.focus()
  assert.equal(useDraft.getState().owner, 'catchup2')
  assert.equal(useDraft.getState().d.what, '') // the next line, not the entry just added
  assert.equal(useDraft.getState().d.date, '2026-11-20')
  stop()
})

test('draft owner: an unmounted keeper stops following the store, and a remount claims the screen', () => {
  const old = keeper('composer-old', 'route-h')
  const stopOld = old.watch()
  reset('Old composer', 'composer-old')
  stopOld() // remounted by key: the old one's cleanup runs first
  renew({ ...blank('2026-11-22'), what: 'Too late' }, 'composer-old') // its await ends after it's gone: nothing kept
  const fresh = keeper('composer-new', 'route-h')
  const stopNew = fresh.watch()
  reset('New composer', 'composer-new')
  reset('Opened row', 'entry5')
  old.focus()
  assert.equal(useDraft.getState().owner, 'entry5') // the old one has no claim left
  fresh.focus()
  assert.equal(useDraft.getState().owner, 'composer-new')
  assert.equal(useDraft.getState().d.what, 'New composer')
  stopNew()
})
