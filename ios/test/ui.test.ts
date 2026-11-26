// The arithmetic and bookkeeping under the design's views: chart paths and scales, rolling-digit keys, fitting a
// figure to its room, list rows and the keypad's typing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement, Fragment } from 'react'
import { axisLabel, barHeight, barScale, linePath, niceMax } from '@/design/ui/chart'
import { charKeys, fitSize } from '@/design/ui/numeric'
import { sectionRows } from '@/design/ui/rows'

test('a flat line is drawn across the middle, not along the bottom', () => {
  const { line } = linePath([500, 500, 500], 100, 132)
  assert.equal(line, 'M0.0,66.0 L50.0,66.0 L100.0,66.0')
  const one = linePath([5], 100, 132)
  assert.equal(one.line, 'M50.0,66.0')
  assert.equal(one.area, '')
  const up = linePath([0, 10], 100, 132)
  assert.equal(up.line, 'M0.0,126.0 L100.0,6.0')
  assert.deepEqual(linePath([], 100, 132), { line: '', area: '' })
  assert.ok(!linePath([NaN, 3, Infinity], 100, 132).line.includes('NaN'))
})

test('the bar scale: a round top, gridlines exactly at their values, exact labels', () => {
  assert.equal(niceMax(240_000), 250_000)
  assert.equal(niceMax(250_000), 250_000)
  assert.equal(niceMax(0), 100_00)
  assert.equal(niceMax(NaN), 100_00)
  const s = barScale([120_000, 240_000], 190)
  assert.equal(s.max, 250_000)
  assert.deepEqual(s.grid.map((g) => [g.y, g.label]), [[0, '$2.5k'], [95, '$1.25k'], [190, '0']])
  assert.deepEqual(barScale([450], 100).grid.map((g) => g.label), ['$5', '$2.50', '0'])
  assert.equal(axisLabel(1_250_000_00), '$1.25M')
  assert.equal(axisLabel(50_000), '$500')
  // all zero, negative, single and broken values give a usable scale
  for (const v of [[0, 0], [-500, -20], [700], [NaN, 300], []]) {
    const { max, grid } = barScale(v, 190)
    assert.ok(Number.isFinite(max) && max > 0, String(v))
    assert.ok(grid.every((g) => Number.isFinite(g.y)), String(v))
  }
  assert.equal(barScale([10], 190, 30_000).max, 50_000) // the average line fits under the top
})

test('bar heights: a sliver for small values, nothing for zero, negative or broken', () => {
  assert.equal(barHeight(1, 100_00, 190), 3)
  assert.equal(barHeight(100_00, 100_00, 190), 190)
  assert.equal(barHeight(0, 100_00, 190), 0)
  assert.equal(barHeight(-50, 100_00, 190), 0)
  assert.equal(barHeight(NaN, 100_00, 190), 0)
})

const changed = (a: string, b: string, typing = false) => {
  const before = new Set(charKeys(a, typing))
  return charKeys(b, typing).filter((k) => !before.has(k))
}

test('typing: a new comma brings in only the new digit and the comma', () => {
  assert.deepEqual(changed('$123', '$1,234', true), [',1', 'd3:4'])
  assert.deepEqual(changed('$1,234', '$12,345', true), [',2', 'd4:5'])
  assert.deepEqual(changed('$12.3', '$12.34', true), ['d3:4'])
  assert.deepEqual(changed('$12', '−$12', true), ['sign'])
})

test('a changing figure: places count from the right, the $ stays', () => {
  assert.deepEqual(changed('$1,204.50', '$1,205.50'), ['d2:5'])
  assert.ok(!changed('$999', '$1,000').includes('cur'))
  assert.deepEqual(changed('$5.00', '$15.00'), ['d3:1'])
  assert.deepEqual(changed('$1,204', '−$1,204'), ['sign'])
  const keys = charKeys('−$1,234.56')
  assert.equal(new Set(keys).size, keys.length)
})

test('a figure steps down to fit its room, never below the floor', () => {
  assert.equal(fitSize(48, 200, 226), 48)
  assert.equal(fitSize(48, 300, 226), 36)
  assert.equal(fitSize(48, 1000, 226), 48 * 0.55)
  assert.equal(fitSize(48, 300, undefined), 48)
  assert.ok(fitSize(48, 300, 226) * (300 / 48) <= 226)
})

const el = (key: string | null, label = '') => createElement('Row', key === null ? { label } : { key, label })

test('list rows: fragments opened, empties dropped, keyed rows keep their keys as the list shifts', () => {
  const rows = sectionRows([el(null, 'Category'), false, createElement(Fragment, null, el(null, 'From'), el(null, 'To')), null])
  assert.equal(rows.length, 3)
  assert.equal(new Set(rows.map((r) => r.key)).size, 3)

  const list = (ids: number[]) => sectionRows([el(null, 'head'), ids.map((id) => el(String(id)))]).map((r) => r.key)
  const before = list([5, 4, 3]), after = list([6, 5, 4, 3])
  for (const k of before) assert.ok(after.includes(k), k) // nothing under the new row remounts
  // a conditional row coming and going doesn't re-key the rows after it
  const cond = (on: boolean) => sectionRows([on && el(null, 'a'), el(null, 'b')]).at(-1)!.key
  assert.equal(cond(true), cond(false))
})
