// Local dates in America/Denver, the zone the phone and server live in, including both DST switches of 2026
// (Mar 8 and Nov 1), plus a zone east of UTC where date strings built with toISOString() shift a day.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays, dayLabel, fromISO, isFuture, monthBefore, monthOf, toISO } from '@/lib/dates'

process.env.TZ = 'America/Denver'
const inZone = (tz: string, fn: () => void) => { const was = process.env.TZ; process.env.TZ = tz; try { fn() } finally { process.env.TZ = was } }

test('toISO/fromISO round-trip every day of three years', () => {
  let d = '2026-01-01', n = 0
  while (d < '2029-01-01') {
    assert.equal(toISO(fromISO(d)), d)
    const next = addDays(d, 1)
    assert.ok(next > d, `${d} -> ${next}`)
    d = next; n++
  }
  assert.equal(n, 365 + 365 + 366)
})

test('addDays across DST and month ends', () => {
  assert.equal(addDays('2026-03-07', 1), '2026-03-08')
  assert.equal(addDays('2026-03-08', 1), '2026-03-09')
  assert.equal(addDays('2026-10-31', 1), '2026-11-01')
  assert.equal(addDays('2026-11-01', 1), '2026-11-02')
  assert.equal(addDays('2028-02-28', 1), '2028-02-29')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(addDays('2026-11-15', -30), '2026-10-16')
})

test('dayLabel counts calendar days, not 24-hour blocks', () => {
  assert.equal(dayLabel('2026-03-08', '2026-03-09'), 'Yesterday') // a 23-hour day
  assert.equal(dayLabel('2026-11-02', '2026-11-01'), 'Tomorrow')  // a 25-hour day
  assert.equal(dayLabel('2026-11-01', '2026-11-01'), 'Today')
  assert.equal(dayLabel('2026-09-14', '2026-09-24'), 'Mon, Sep 14')
  assert.equal(dayLabel('2025-12-31', '2026-01-01'), 'Yesterday')
  assert.equal(dayLabel('2025-12-30', '2026-01-01'), 'Tue, Dec 30, 2025')
})

test('month helpers', () => {
  assert.equal(monthOf('2026-09-30'), '2026-09-01')
  assert.equal(monthBefore('2026-09-24'), '2026-08-01')
  assert.equal(monthBefore('2026-01-05'), '2025-12-01')
  assert.equal(monthBefore('2026-03-31'), '2026-02-01')
  assert.ok(isFuture('2026-09-25', '2026-09-24') && !isFuture('2026-09-24', '2026-09-24'))
})

test('late at night the date is still today', () => {
  assert.equal(toISO(new Date(2026, 8, 30, 23, 59, 59)), '2026-09-30')
  assert.equal(toISO(new Date(2026, 9, 1, 0, 0, 0)), '2026-10-01')
  assert.equal(toISO(new Date(2026, 10, 1, 1, 30)), '2026-11-01') // the repeated hour when DST ends
})

test('monthBefore works east of UTC too', () => {
  for (const tz of ['Europe/Berlin', 'Asia/Tokyo', 'Pacific/Auckland']) {
    inZone(tz, () => {
      assert.equal(monthBefore('2026-09-24'), '2026-08-01', tz)
      assert.equal(monthBefore('2026-01-01'), '2025-12-01', tz)
    })
  }
})
