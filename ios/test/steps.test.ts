import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blank } from '@/lib/draft'
import { nextStep, stepsFor, type Step } from '@/lib/steps'

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
