// Links held while Face ID lock is on (or before its setting loads): a plain launch must never open Safari.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { holdLink, useLock } from '@/lib/lock'

const held = (path: string) => { useLock.setState({ held: null }); holdLink(path); return useLock.getState().held }

test('a plain launch holds nothing', () => {
  assert.equal(held('tally:///'), null) // was "//", which expo-router opened as https://
  assert.equal(held('tally://'), null)
  assert.equal(held('/'), null)
})

test('a quick-capture link is kept as a route', () => {
  assert.equal(held('tally://new?amount=1'), '/new?amount=1')
  assert.equal(held('tally:///new?amount=1'), '/new?amount=1')
  assert.equal(held('/new'), '/new')
  assert.equal(held('new'), '/new')
})
