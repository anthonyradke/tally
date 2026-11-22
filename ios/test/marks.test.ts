import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchScore, rankMarks } from '@/lib/marks'

const opts = ['7-Eleven', 'Adobe', 'Airbnb', 'Safeway', 'Shell', 'Whole Foods'].map((title, i) => ({ id: String(i), spec: { title } }))
const titles = (xs: typeof opts) => xs.map((x) => x.spec.title)

test('brands that share a word with the place come first, the rest keep their order', () => {
  assert.deepEqual(titles(rankMarks(opts, 'Safeway #1234')), ['Safeway', '7-Eleven', 'Adobe', 'Airbnb', 'Shell', 'Whole Foods'])
  assert.deepEqual(titles(rankMarks(opts, 'whole foods market')).slice(0, 1), ['Whole Foods'])
  assert.deepEqual(titles(rankMarks(opts, '')), titles(opts))
})

test('a search keeps only brands containing it, the closest first', () => {
  assert.deepEqual(titles(rankMarks(opts, 'Safeway', 'sh')), ['Shell'])
  assert.deepEqual(titles(rankMarks(opts, 'Safeway', 'way')), ['Safeway'])
  assert.deepEqual(titles(rankMarks(opts, 'Safeway', 'a')), ['Adobe', 'Airbnb', 'Safeway'])
  assert.deepEqual(rankMarks(opts, 'Safeway', 'zzz'), [])
})

test('match scores', () => {
  assert.equal(matchScore('Shell', 'shell'), 3)
  assert.equal(matchScore('Shell', 'Shell Oil 5521'), 2)
  assert.equal(matchScore('Whole Foods', 'Foods co-op'), 1)
  assert.equal(matchScore('Adobe', 'Safeway'), 0)
})
