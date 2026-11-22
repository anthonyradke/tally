// Settings editors after review: Undo bodies that put a recurring schedule back exactly, hiding an account with
// everything that would post to it, the one "Changes not saved" toast, and Recently deleted's groups.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AdminAccount, AdminData, AdminRecurring, DeletedTxn, Favorite } from '@/lib/api'
import { asEntry, byDelete } from '@/lib/deleted'
import { initial, movable, moveTargets, movedText, recurringBody, unmoveBody, usersText } from '@/lib/forms'
import { useToast } from '@/lib/toast'
import { offerBack } from '@/lib/unsaved'

process.env.TZ = 'America/Denver'

const today = '2026-11-22'
const rent = (x: Partial<AdminRecurring> = {}): AdminRecurring => ({
  id: 1, label: 'Rent', category_id: 2, from_account_id: 1, to_account_id: null, amount: 140000, what: 'Rent', freq: 'monthly',
  next_date: '2027-02-01', next_due: '2026-12-08', next_slot: '2026-12-01', horizon_days: 45, active: 1, anchor_day: 31, created_at: '', ...x,
})
const acct = (id: number, x: Partial<AdminAccount> = {}): AdminAccount => ({
  id, name: `A${id}`, kind: 'cash', bank: null, start_balance: 0, apy: null, loan_rate: null, ef: 0, color: null, icon: null, active: 1, opened: null, sort: id, ...x,
})
const fav = (id: number, x: Partial<Favorite> = {}): Favorite =>
  ({ id, label: `Q${id}`, category_id: 2, from_account_id: 3, to_account_id: null, amount: null, sort: id, icon: null, color: null, ...x })
const admin = (x: Partial<AdminData> = {}): AdminData => ({
  accounts: [], categories: [], favorites: [], recurring: [], saved_views: [], budgets: [], skips: [], settings: {}, ...x,
})

test('a list action keeps the schedule whatever date it carries', () => {
  assert.equal(recurringBody(rent()).move, false)
})

test('undo of a move goes back to where the schedule stood, aiming for its old day', () => {
  const b = unmoveBody(rent())
  assert.equal(b.next_date, '2026-12-01') // the date its row was posted for, not the day it was moved to by hand
  assert.equal(b.anchor_day, 31)
  assert.equal(b.move, true)
  assert.equal(unmoveBody(rent({ next_slot: undefined })).next_date, '2026-12-08') // an older server
})

test('the recurring editor keeps no copy of Pause to send back later', () => {
  assert.equal('active' in initial('recurring', 1, admin({ recurring: [rent({ active: 0 })] }), today), false)
  assert.equal('active' in initial('recurring', undefined, admin(), today), false)
})

test('a move onto a skipped date says when it really starts', () => {
  assert.equal(movedText('Rent', 'monthly', '2026-12-01', today, '2027-01-01'), 'Rent now posts on the 1st, starting Jan 1, 2027')
  assert.equal(movedText('Rent', 'monthly', '2026-12-03', today, '2026-12-03'), 'Rent now posts on the 3rd, starting Dec 3')
  // A row changed by hand that comes sooner doesn't change what the toast says the schedule does.
  assert.equal(movedText('Rent', 'monthly', '2026-12-20', today, '2026-12-01'), 'Rent now posts on the 20th, starting Dec 20')
})

test('hiding an account also moves the paused bills that would post to it once resumed', () => {
  const a = admin({ recurring: [rent({ id: 1, from_account_id: 3 }), rent({ id: 2, from_account_id: 3, active: 0 }), rent({ id: 3, from_account_id: 4 })] })
  const u = movable(a, 3)
  assert.deepEqual(u.recurring.map((x) => x.id), [1, 2])
  assert.equal(usersText(u), '2 recurring bills')
})

test('an account can only take items that do not already use it on their other side', () => {
  const a = admin({ accounts: [acct(3), acct(4), acct(5), acct(6, { active: 0 })], favorites: [fav(1, { from_account_id: 4, to_account_id: 3 })], recurring: [rent({ from_account_id: 3 })] })
  assert.deepEqual(moveTargets(a, 3, movable(a, 3)).map((x) => x.id), [5]) // 4 would be From and To at once; 6 is hidden
})

test('every editor says the same when closed with changes', () => {
  let reopened = false
  offerBack(() => { reopened = true })
  const t = useToast.getState().toast!
  assert.equal(t.text, 'Changes not saved')
  assert.equal(t.action?.label, 'Restore')
  t.action!.run()
  assert.equal(reopened, true)
  useToast.getState().hide()
})

test('recently deleted groups the rows of one delete, not every delete in the same second', () => {
  const at = '2026-11-22T17:00:00+00:00'
  const row = (id: number, batch?: number | null) => ({ id, deleted_at: at, batch }) as unknown as DeletedTxn
  assert.deepEqual(byDelete([row(4, 4), row(3, 3), row(2, 1), row(1, 1)]).map((g) => g.map((x) => x.id)), [[4], [3], [2, 1]])
  // Rows kept before batches were: the second they went is all there is.
  assert.deepEqual(byDelete([row(2), row(1, null)]).map((g) => g.length), [2])
  assert.deepEqual(asEntry(row(5, 5)), { id: 5 })
})
