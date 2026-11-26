// Saving one ledger account from Settings: showing or hiding it, renaming it. PUT /api/accounts/{id} writes every
// field it's sent (a missing sort or colour would be reset), so the body is the whole account as the server has it
// (from /api/admin) with the change on top. APY, loan rate and the opening month are left out so the server keeps
// them as they are (app/api_admin.py `_account_fields`). The starting balance goes in dollars, like every body.
import { api, type Account, type AdminAccount, type Bootstrap, type Kind } from './api'
import { queryClient } from './data'

export type AccountChange = { active?: boolean; name?: string }

export function accountBody(row: AdminAccount, change: AccountChange = {}) {
  return {
    name: change.name ?? row.name, kind: row.kind, bank: row.bank, ef: !!row.ef, sort: row.sort,
    color: row.color, icon: row.icon, active: change.active ?? !!row.active, start_balance: row.start_balance / 100,
  }
}

/** The kinds in the order Accounts lists them, each with its accounts in ledger order; empty kinds left out. */
export const KIND_ORDER: Kind[] = ['cash', 'card', 'investment', 'loan']
export function byKind<T extends Pick<Account, 'kind'>>(list: T[]): [Kind, T[]][] {
  return KIND_ORDER.map((k) => [k, list.filter((a) => a.kind === k)] as [Kind, T[]]).filter(([, l]) => l.length > 0)
}

/** The change on the cached ledger, so the screens show it before the server answers (and again to take it back). */
export function patchAccount(id: number, change: AccountChange) {
  queryClient.setQueryData<Bootstrap>(['bootstrap'], (b) => b && { ...b, accounts: b.accounts.map((a) => (a.id === id ? { ...a, ...change } : a)) })
}

// One save at a time per account, in the order they were made: switching one off and straight back on must not land
// on the server the other way round. The ledger is fetched again once nothing is left to save, so a refetch between
// two quick switches can't show the second one undone for a moment.
const queue = new Map<number, Promise<unknown>>()
let saving = 0

/** Shows the change at once, then saves it. On a refusal the change is taken back and the error thrown. */
export function saveAccount(a: Pick<Account, 'id' | 'name' | 'active'>, change: AccountChange): Promise<void> {
  const undo: AccountChange = {}
  if (change.active !== undefined) undo.active = a.active
  if (change.name !== undefined) undo.name = a.name
  patchAccount(a.id, change)
  saving++
  const job = async () => {
    try {
      // A refetch already on its way would land the old account over the change. Cancelling it puts back what it
      // started from, so the change goes on again after.
      await queryClient.cancelQueries({ queryKey: ['bootstrap'] })
      patchAccount(a.id, change)
      // Always the server's copy as it is now: anything older would be written back over a change made since.
      const rows = (await queryClient.fetchQuery({ queryKey: ['admin'], queryFn: api.admin, staleTime: 0 })).accounts
      const row = rows.find((r) => r.id === a.id)
      if (!row) throw new Error('That account is gone.')
      await api.saveAccount(accountBody(row, change), a.id)
    } catch (e) {
      patchAccount(a.id, undo)
      throw e
    } finally {
      if (--saving === 0) {
        void queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
        void queryClient.invalidateQueries({ queryKey: ['admin'] })
      }
    }
  }
  const run = (queue.get(a.id) ?? Promise.resolve()).then(job, job)
  queue.set(a.id, run.catch(() => {}))
  return run
}
