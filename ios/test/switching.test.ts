// Activity's switcher lights.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { labelOpacity, lights, lit } from '@/design/ui/switching'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

test('a move hands the capsule from one option to the other and the lights always fill the bar', () => {
  const from = [1, 0, 0, 0]
  assert.deepEqual(lights(from, 2, 0), [1, 0, 0, 0])
  assert.deepEqual(lights(from, 2, 1), [0, 0, 1, 0])
  for (const t of [0, 0.1, 0.37, 0.5, 0.9, 1]) {
    const l = lights(from, 2, t)
    assert.ok(near(sum(l), 1), `t=${t}`)
    assert.equal(l[1], 0) // an option the move passes over stays a round button
    assert.equal(l[3], 0)
  }
  assert.ok(near(lit(from, 2, 0.25, 0), 0.75))
  assert.ok(near(lit(from, 2, 0.25, 2), 0.25))
})

test('a move that interrupts another starts from where the lights stood', () => {
  // All → Transfers, a third of the way there, then Spending.
  const mid = lights([1, 0, 0, 0], 3, 1 / 3)
  assert.ok(near(sum(mid), 1))
  for (const t of [0, 0.2, 0.6, 1]) assert.ok(near(sum(lights(mid, 1, t)), 1), `t=${t}`)
  const start = lights(mid, 1, 0)
  assert.deepEqual(start, mid) // no jump when the new move begins
  assert.deepEqual(lights(mid, 1, 1).map((x) => Math.round(x * 1e9) / 1e9), [0, 1, 0, 0])
  // back to where it came from, mid-move
  assert.ok(near(lights(mid, 0, 0.5)[0], 2 / 3 + (1 - 2 / 3) * 0.5))
})

test('a name shows only once its capsule has room for it', () => {
  assert.equal(labelOpacity(0), 0)
  assert.equal(labelOpacity(0.5), 0)
  assert.equal(labelOpacity(0.75), 0.5)
  assert.equal(labelOpacity(1), 1)
})
