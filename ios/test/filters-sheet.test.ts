// The Filters sheet's tag chips and the saved view Activity names above its list.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SavedView } from '@/lib/api'
import { EMPTY, fromViewQuery, namedView, tagChoices, tagOf } from '@/lib/filters'

const today = '2026-11-20'
const used = ['work', 'roadtrip', 'rome', 'gift', 'a', 'b', 'c', 'd', 'e'].map((tag, i) => ({ tag, count: 20 - i }))

test('filters sheet: the tag typed and the tags offered for it', () => {
  assert.equal(tagOf(' #Trip '), 'trip')
  assert.equal(tagOf('#'), undefined)
  assert.deepEqual(tagChoices(used, ''), ['work', 'roadtrip', 'rome', 'gift', 'a', 'b', 'c', 'd'])
  assert.deepEqual(tagChoices(used, '#ro'), ['roadtrip', 'rome'])
  assert.deepEqual(tagChoices(used, 'zzz'), [])
  // A whole tag picked: the most used again, with it among them, so another is one tap away.
  assert.deepEqual(tagChoices(used, 'rome'), tagChoices(used, ''))
  assert.deepEqual(tagChoices(used, 'e'), ['work', 'roadtrip', 'rome', 'gift', 'a', 'b', 'c', 'e'])
})

test('activity names the saved view that is on, or the one just moved on from', () => {
  const views: SavedView[] = [
    { id: 1, name: 'Dining last month', query: 'category=5&when=last&sort=date&dir=desc', icon: null, sort: 0 },
    { id: 2, name: 'Dining again', query: 'category=5&when=last&sort=date&dir=desc', icon: null, sort: 1 },
  ]
  const on = fromViewQuery(views[0].query, today)
  assert.deepEqual(namedView(views, on, 1, today), { v: views[0], on: true })
  assert.deepEqual(namedView(views, on, 2, today), { v: views[1], on: true }) // the one put on, when two match
  assert.deepEqual(namedView(views, on, null, today), { v: views[0], on: true }) // the same filters set by hand
  // Moved on from it: offered back. Nothing filtered, or no view put on: nothing.
  assert.deepEqual(namedView(views, { ...on, tag: 'trip' }, 1, today), { v: views[0], on: false })
  assert.equal(namedView(views, { ...on, tag: 'trip' }, null, today), undefined)
  assert.equal(namedView(views, EMPTY, 1, today), undefined)
  assert.equal(namedView(views, on, 9, today)?.v.id, 1) // a view deleted since
})
