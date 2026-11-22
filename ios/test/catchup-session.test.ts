import { test } from 'node:test'
import assert from 'node:assert/strict'
import { duplicateOf, lastShown, runningBalances, sessionRows } from '@/lib/catchup'
import { acct, row } from './fixtures'

const CHK = 1

test('catchup: a row this session added is a lookalike too, but not one it took back', () => {
  const old = row('2026-11-10', 900, { from_id: CHK, what: 'Rent' })
  const amazon = { ...row('2026-11-22', 4299, { from_id: CHK, what: 'Amazon' }), by: 2 }
  const undone = { ...row('2026-11-22', 1500, { from_id: CHK, what: 'Gas' }), by: 2 }
  // The full list (version 2) was fetched before either went in: the session's rows are added to it.
  const { rows } = sessionRows([amazon, undone], [old], 2, new Set([undone.id]))
  const gone = (id: number) => id === undone.id
  // Amazon again, its amount copied from the one just added: the same place on the same day is the duplicate.
  assert.equal(duplicateOf(rows!, { date: '2026-11-22', amount: 4299, what: 'amazon' }, CHK, gone, true)?.id, amazon.id)
  // Re-adding the entry an Undo took back to fix it isn't a duplicate of itself.
  assert.equal(duplicateOf(rows!, { date: '2026-11-22', amount: 1500, what: 'Gas' }, CHK, gone), null)
})

test('catchup: the balance after the entry just added follows a later fix to it', () => {
  const chk = acct(CHK, 'cash', 100000)
  const xcel = row('2026-11-20', 8812, { from_id: CHK, what: 'Xcel' })
  const costco = row('2026-11-21', 13244, { from_id: CHK, what: 'Costco' })
  const last = { row: costco, label: 'Costco', cents: 13244, after: { cents: 100000 - 8812 - 13244, date: costco.date } }
  // Xcel fixed from $88.12 to $88.21 in the editor: the list now has the new figure.
  const fixed = [{ ...xcel, amount: 8821 }, costco]
  const shown = lastShown(last, [costco], runningBalances(chk, fixed, '2026-10-01'))
  assert.equal(shown?.after?.cents, 100000 - 8821 - 13244)
  // Before the balances are known, the figure from when it went in.
  assert.equal(lastShown(last, [costco], null)?.after?.cents, last.after.cents)
  // Deleted elsewhere: nothing to show or undo. Queued or skipped lines (no row) stay as they are.
  assert.equal(lastShown(last, [], null), null)
  const skipped = { row: null, label: 'Pay off card', cents: 5000, skipped: true as const }
  assert.equal(lastShown(skipped, [], null), skipped)
})
