import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bigWeekday, daysOf } from '@/lib/calendar'
import { addDays, fromISO } from '@/lib/dates'

process.env.TZ = 'America/Denver'

test('daysOf: every day of the month, refunds netted', () => {
  const d = daysOf('2026-02-01', [{ date: '2026-02-03', amount: 500 }, { date: '2026-02-03', amount: -200 }, { date: '2026-03-01', amount: 9 }])
  assert.equal(d.length, 28)
  assert.deepEqual(d[2], { date: '2026-02-03', cents: 300 })
  assert.equal(d.reduce((n, x) => n + x.cents, 0), 300)
})

test('bigWeekday: the day that costs the most, when it stands out', () => {
  const rows = []
  for (let d = '2026-07-01'; d < '2026-10-01'; d = addDays(d, 1)) rows.push({ date: d, amount: fromISO(d).getDay() === 6 ? 9000 : 1000 })
  const w = bigWeekday(rows, '2026-10-01', '2026-07-01')!
  assert.equal(w.day, 'Saturdays')
  assert.equal(w.avg, 9000)
  assert.equal(bigWeekday(rows.map((r) => ({ ...r, amount: 1000 })), '2026-10-01', '2026-07-01'), null) // nothing stands out
  assert.equal(bigWeekday(rows, '2026-10-01', '2026-09-15'), null) // too little history
})
