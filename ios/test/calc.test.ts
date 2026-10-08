import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expression, operate, total } from '@/lib/calc'

test('calc: a running total with + and −', () => {
  let c = operate(null, '12.50', 1)
  assert.equal(total(c, '4.25'), 1675)
  c = operate(c, '4.25', -1)
  assert.equal(expression(c, ''), '12.50 + 4.25 −')
  assert.equal(total(c, '1.00'), 1575)
  assert.equal(expression(c, '1.00'), '12.50 + 4.25 − 1.00')
  c = operate(c, '', 1) // switching the operator before typing
  assert.equal(expression(c, ''), '12.50 + 4.25 +')
  assert.equal(total(null, '3.00'), 300)
})
