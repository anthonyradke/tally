// Activity's switcher lights, the screenful a list switch moves, and the move's curve.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { itemProgress, labelOpacity, lights, lit, settle, sideOf, splitHead, SWAP_MS, SWAP_TRAVEL, swapLook } from '@/design/ui/switching'

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

test('a switch moves a screenful, a day cut in two keeping one card', () => {
  const day = (key: string, n: number) => ({ key, data: Array.from({ length: n }, (_, i) => `${key}${i}`) })
  const sections = [day('a', 3), day('b', 5), day('c', 4)]
  const { head, tail } = splitHead(sections, 6)
  assert.deepEqual(head.map((s) => [s.key, s.data.length, !!s.open]), [['a', 3, false], ['b', 3, true]])
  assert.deepEqual(tail.map((s) => [s.key, s.data.length, !!s.cont]), [['b', 2, true], ['c', 4, false]])
  assert.equal(head[0], sections[0]) // whole days are passed through untouched
  assert.equal(tail[1], sections[2])
  assert.deepEqual([...head[1].data, ...tail[0].data], sections[1].data)
  assert.equal(sections[1].data.length, 5) // the full list isn't changed
  const at8 = splitHead(sections, 8)
  assert.deepEqual([at8.head.map((s) => s.key), at8.tail.map((s) => s.key)], [['a', 'b'], ['c']])
  assert.equal(at8.tail[0].cont, undefined) // a day that starts below the screenful has its title
  assert.deepEqual(splitHead(sections, 99), { head: sections, tail: [] })
  assert.deepEqual(splitHead(sections, 0), { head: [], tail: sections })
  assert.deepEqual(splitHead([], 10), { head: [], tail: [] })
})

test('the move settles like a critically damped spring: from rest, never past its mark', () => {
  assert.equal(settle(0), 0)
  assert.equal(settle(1), 1)
  let prev = 0
  for (let x = 0.01; x <= 1; x += 0.01) {
    const v = settle(x)
    assert.ok(v >= prev && v <= 1, `x=${x}`)
    prev = v
  }
  assert.ok(settle(0.02) < 0.01) // starts gently
  assert.ok(settle(0.5) > 0.75) // most of the way by half time
  assert.ok(SWAP_MS >= 280 && SWAP_MS <= 330)
})

test('the first rows lead by a beat; the rest move together', () => {
  assert.equal(itemProgress(0, 0), 0)
  assert.equal(itemProgress(1, 0), 1)
  assert.equal(itemProgress(1, 9), 1)
  assert.ok(itemProgress(0.3, 0) > itemProgress(0.3, 1))
  assert.ok(itemProgress(0.3, 3) > itemProgress(0.3, 4))
  assert.equal(itemProgress(0.3, 4), itemProgress(0.3, 12))
})

test('old and new screenfuls cross: out the side away from the capsule, in from its side, never both gone', () => {
  assert.deepEqual(swapLook(1, 0, 1, 0), { opacity: 1, x: 0 }) // resting, in place
  // A move to the right begins: the new one waits off to the right, unseen; the old one in place.
  assert.deepEqual(swapLook(0, 0, 1, 0), { opacity: 0, x: SWAP_TRAVEL })
  const gone = swapLook(1, 1, 1, 0) // it ends: the old one gone to the left
  assert.equal(gone.opacity, 0)
  assert.equal(gone.x, -SWAP_TRAVEL)
  // Mirrored for a move left; a crossfade in place doesn't travel.
  assert.equal(swapLook(0, 0, -1, 0).x, -SWAP_TRAVEL)
  assert.equal(swapLook(0.5, 0, 0, 0).x, 0)
  for (let x = 0; x <= 1; x += 0.05) {
    for (const i of [0, 2, 8]) {
      const both = swapLook(x, 0, 1, i).opacity + swapLook(1, x, 1, i).opacity
      assert.ok(both > 0.5, `x=${x} i=${i}: ${both}`) // something is always on screen
    }
  }
})

test('a switch moves toward the side the new filter is on', () => {
  const keys = ['all', 'Spending', 'Money in', 'Transfer']
  assert.equal(sideOf(keys, 'all', 'Money in'), 1)
  assert.equal(sideOf(keys, 'Transfer', 'Spending'), -1)
  assert.equal(sideOf(keys, 'all', 'all'), 0)
})
