import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compactCents, formatCents, formatCentsW, parseDollars, pct } from '@/lib/money'
import { rand } from './util.ts'

test('formatCents: statement style with a true minus sign', () => {
  assert.equal(formatCents(0), '$0.00')
  assert.equal(formatCents(5), '$0.05')
  assert.equal(formatCents(-123456), '−$1,234.56')
  assert.equal(formatCents(123456, { sign: 'always' }), '+$1,234.56')
  assert.equal(formatCents(-123456, { sign: 'never' }), '$1,234.56')
  assert.equal(formatCents(123456, { cents: false }), '$1,235')
  assert.equal(formatCents(123449, { cents: false }), '$1,234')
  assert.equal(formatCents(999_999_999_99), '$999,999,999.99')
})

test('the worklet formatter matches formatCents for every sign and size', () => {
  const r = rand(1)
  const values = [0, 1, 9, 10, 99, 100, 101, 999, 1000, 99999, 100000, 123456789, -1, -100, -99999]
  for (let i = 0; i < 5000; i++) values.push(Math.round((r() - 0.5) * 10 ** Math.floor(r() * 12)))
  for (const v of values) {
    for (const cents of [true, false]) {
      for (const sign of ['auto', 'always', 'never'] as const) {
        assert.equal(formatCentsW(v, cents, sign), formatCents(v, { cents, sign }), `${v} ${cents} ${sign}`)
      }
    }
  }
})

test('parseDollars: what people type', () => {
  assert.equal(parseDollars('12.5'), 1250)
  assert.equal(parseDollars('$1,234.56'), 123456)
  assert.equal(parseDollars(' 7 '), 700)
  assert.equal(parseDollars('−3.10'), -310)
  assert.equal(parseDollars('1.005'), 101) // half-up, like the server's cents()
  assert.equal(parseDollars('-1.005'), -101)
  assert.equal(parseDollars('0.015'), 2)
  for (const junk of ['', '-', '.', 'abc', '1.2.3', 'Infinity', '1e999']) assert.equal(parseDollars(junk), null, junk)
})

test('parseDollars matches the server rounding for three-decimal inputs', () => {
  // The server's cents() is Decimal half-up. Check every x.xx5 up to $100.
  for (let n = 0; n < 10000; n++) {
    const s = `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}5`
    assert.equal(parseDollars(s), n + 1, s)
  }
})

test('pct clamps to 0..1', () => {
  assert.equal(pct(5, 10), 0.5)
  assert.equal(pct(20, 10), 1)
  assert.equal(pct(-1, 10), 0)
  assert.equal(pct(5, 0), 0)
})

test('compactCents for axes and chips', () => {
  assert.equal(compactCents(0), '$0')
  assert.equal(compactCents(99_949), '$999')
  assert.equal(compactCents(140_000), '$1.4k')
  assert.equal(compactCents(1_200_000), '$12k')
  assert.equal(compactCents(-150_000), '−$1.5k')
  assert.equal(compactCents(120_000_000), '$1.2M')
})

test('compactCents rounds up into the next unit instead of showing $1000', () => {
  assert.equal(compactCents(99_960), '$1k')
  assert.equal(compactCents(999_960), '$10k')
  assert.equal(compactCents(99_995_000), '$1M')
  assert.equal(compactCents(-99_995_000), '−$1M')
})
