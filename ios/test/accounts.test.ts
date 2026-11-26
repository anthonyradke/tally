// Settings › Accounts: the body that saves one account whole, the kinds in order, and the switch that shows the
// change at once and takes it back when the server refuses.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountBody, byKind, saveAccount } from '@/lib/accounts'
import { api, type AdminAccount, type Bootstrap } from '@/lib/api'
import { queryClient } from '@/lib/data'
import { acct, boot } from './fixtures'

const row = (x: Partial<AdminAccount> = {}): AdminAccount => ({
  id: 7, name: 'Everyday', kind: 'cash', bank: 'First Bank', start_balance: 123456, apy: 4.1, loan_rate: null, ef: 1,
  color: '#112233', icon: 'star', active: 1, opened: null, sort: 3, ...x,
})

test('the body carries the whole account, the starting balance in dollars, and leaves the rates and opening month out', () => {
  const b = accountBody(row(), { active: false })
  assert.deepEqual(b, { name: 'Everyday', kind: 'cash', bank: 'First Bank', ef: true, sort: 3, color: '#112233', icon: 'star', active: false, start_balance: 1234.56 })
  assert.ok(!('apy' in b) && !('loan_rate' in b) && !('opened' in b))
  assert.equal(accountBody(row({ active: 0 }), { name: 'Bills' }).name, 'Bills')
  assert.equal(accountBody(row({ active: 0 }), { name: 'Bills' }).active, false)
})

test('kinds come in the order Accounts shows them, empty ones left out', () => {
  const groups = byKind([acct(1, 'loan'), acct(2, 'cash'), acct(3, 'card'), acct(4, 'cash')])
  assert.deepEqual(groups.map(([k, l]) => [k, l.map((a) => a.id)]), [['cash', [2, 4]], ['card', [3]], ['loan', [1]]])
})

const active = (id: number) => queryClient.getQueryData<Bootstrap>(['bootstrap'])?.accounts.find((a) => a.id === id)?.active

test('a switch shows at once and saves the full account', async (t) => {
  queryClient.setQueryData(['bootstrap'], boot({ accounts: [acct(7, 'cash', 0, { name: 'Everyday' })] }))
  const sent: [object, number | undefined][] = []
  t.mock.method(api, 'admin', async () => ({ accounts: [row()] }))
  t.mock.method(api, 'saveAccount', async (body: object, id?: number) => { sent.push([body, id]); return row({ active: 0 }) })
  const done = saveAccount({ id: 7, name: 'Everyday', active: true }, { active: false })
  assert.equal(active(7), false)
  await done
  assert.equal(sent.length, 1)
  assert.equal(sent[0][1], 7)
  assert.equal((sent[0][0] as { active: boolean }).active, false)
  assert.equal((sent[0][0] as { start_balance: number }).start_balance, 1234.56)
  queryClient.clear()
})

test('a refused switch goes back', async (t) => {
  queryClient.setQueryData(['bootstrap'], boot({ accounts: [acct(7, 'cash', 0, { name: 'Everyday' })] }))
  t.mock.method(api, 'admin', async () => ({ accounts: [row()] }))
  t.mock.method(api, 'saveAccount', async () => { throw new Error('nope') })
  await assert.rejects(saveAccount({ id: 7, name: 'Everyday', active: true }, { active: false }), /nope/)
  assert.equal(active(7), true)
  queryClient.clear()
})
