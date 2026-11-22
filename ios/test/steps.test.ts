import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blank } from '@/lib/draft'
import { answeredBy, needed, nextStep, stepAfter, stepsFor, type Step } from '@/lib/steps'

const none = new Set<Step>()

test('steps: each kind asks only for the accounts it uses', () => {
  assert.deepEqual(stepsFor('Spending'), ['amount', 'what', 'category', 'from', 'review'])
  assert.deepEqual(stepsFor('Money in'), ['amount', 'what', 'category', 'to', 'review'])
  assert.deepEqual(stepsFor('Transfer'), ['amount', 'what', 'category', 'from', 'to', 'review'])
  assert.deepEqual(stepsFor('Saving'), ['amount', 'what', 'category', 'from', 'to', 'review'])
})

test('steps: next goes in order through what is missing', () => {
  const d = { ...blank('2026-09-25'), amount: '12.50' }
  assert.equal(nextStep('amount', d, none), 'what')
  assert.equal(nextStep('what', d, none), 'category')
  assert.equal(nextStep('category', { ...d, category_id: 3 }, none), 'from')
  assert.equal(nextStep('from', { ...d, category_id: 3, from_id: 1 }, none), 'review')
})

test('steps: what a quick action or past entry filled in is skipped', () => {
  const d = { ...blank('2026-09-25'), amount: '40', what: 'Shell', category_id: 4, from_id: 2 }
  assert.equal(nextStep('amount', d, none), 'review')
  assert.equal(nextStep('amount', { ...d, from_id: null }, none), 'from')
})

test('steps: a step already shown is not asked again', () => {
  const d = { ...blank('2026-09-25'), amount: '40', kind: 'Saving' as const, category_id: 9, from_id: 1 }
  assert.equal(nextStep('from', d, none), 'to')
  assert.equal(nextStep('from', d, new Set<Step>(['to'])), 'review')
  assert.equal(nextStep('amount', { ...d, what: '' }, new Set<Step>(['what'])), 'to')
})

test('steps: a required step shown but left empty is asked again', () => {
  const d = { ...blank('2026-09-25'), amount: '40', what: 'Shell' }
  const seen = new Set<Step>(['what', 'category', 'from'])
  assert.equal(nextStep('what', d, seen), 'category')
  assert.equal(nextStep('what', { ...d, category_id: 4 }, seen), 'from')
  assert.equal(nextStep('what', { ...d, category_id: 4, from_id: 2 }, seen), 'review')
  assert.equal(needed('category', d), true)
  assert.equal(needed('to', { ...d, kind: 'Saving' }), false)
  assert.equal(needed('to', { ...d, kind: 'Transfer' }), true)
})

test('steps: Next goes one page on, never to a page in the middle', () => {
  const d = { ...blank('2026-09-25'), amount: '40', what: 'Shell', category_id: 4, from_id: null }
  assert.equal(stepAfter('amount', d), 'what')
  assert.equal(stepAfter('what', d), 'category') // the category is filled but From isn't: no leap to From
  assert.equal(stepAfter('category', d), 'from')
  assert.equal(stepAfter('from', { ...d, from_id: 2 }), 'review')
  assert.equal(stepAfter('from', { ...d, from_id: 2, kind: 'Transfer' }), 'to')
  assert.equal(stepAfter('amount', { ...blank('2026-09-25'), amount: '40' }), 'what') // a fresh entry: one at a time
})

test('steps: Next goes to the review once everything after is answered', () => {
  // A Coffee chip with no saved amount: once the amount is typed, nothing else is left.
  const d = { ...blank('2026-09-25'), amount: '40', what: 'Coffee', category_id: 4, from_id: 2 }
  assert.equal(stepAfter('amount', d), 'review')
  assert.equal(stepAfter('what', d), 'review')
  // A Gas chip that leaves the name for you: the name page first, then the review.
  assert.equal(stepAfter('amount', { ...d, what: '' }), 'what')
  assert.equal(stepAfter('what', { ...d, what: '' }, new Set<Step>(['what'])), 'review')
  // An optional To not yet shown is still a page to see; once shown and left empty, it's answered.
  const s = { ...d, kind: 'Saving' as const }
  assert.equal(stepAfter('amount', s), 'what')
  assert.equal(stepAfter('amount', s, new Set<Step>(['to'])), 'review')
})

test('steps: a Saving chip with no To goes from the amount past the pages it answered', () => {
  const d = { ...blank('2026-09-25'), kind: 'Saving' as const, amount: '200', what: 'Vanguard', category_id: 4, from_id: 2 }
  const seen = new Set<Step>(['amount', ...answeredBy('Saving')])
  assert.equal(stepAfter('amount', d, seen), 'review')
  assert.equal(stepAfter('amount', { ...d, what: '' }, seen), 'what') // a chip that leaves the name for you
  assert.equal(stepAfter('what', { ...d, what: '' }, new Set<Step>([...seen, 'what'])), 'review')
  assert.equal(nextStep('amount', { ...d, from_id: null }, seen), 'from') // a required account still missing
  assert.deepEqual(answeredBy('Spending'), ['category', 'from'])
})
