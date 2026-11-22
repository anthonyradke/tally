// The Filters sheet's tag chips and the saved view Activity names above its list.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tagChoices, tagOf } from '@/lib/filters'

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
