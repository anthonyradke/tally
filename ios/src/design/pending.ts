// Pending bank rows as Activity and an account's page show them: dimmed at the top until the bank posts them, never
// counted in a day's total, a search's results or any figure. The server shapes each like the entry it would become
// (PendingTxn), so it reads like any entry.
import type { Account, CatType, PendingTxn } from '@/lib/api'
import { signFrom, type AmountLook, type Filter } from './ledger'
import { amountLook } from './look'

const MOVES: CatType[] = ['Transfer', 'Loan', 'Saving']

/** The pending rows a filter of Activity shows: all of them, or charges under Spending, money in under Income and
 *  moves between your own accounts under Transfers. None while searching: a search finds entries. */
export function pendingFor(rows: readonly PendingTxn[] | null | undefined, filter: Filter, q?: string): PendingTxn[] {
  if (!rows?.length || q) return []
  if (filter === 'all') return [...rows]
  return rows.filter((r) => (filter === 'Transfer' ? MOVES.includes(r.type) : r.type === filter))
}

/** One account's pending rows (the account the bank shows them on). */
export const pendingOn = (rows: readonly PendingTxn[] | null | undefined, accountId: number): PendingTxn[] =>
  (rows ?? []).filter((r) => r.account_id === accountId)

/** How a pending row's amount reads: like an entry of its type, or in an account's list like that account's
 *  statement. */
export function pendingAmount(r: PendingTxn, account?: Pick<Account, 'id' | 'kind'>): AmountLook {
  return account ? signFrom(r, account) : amountLook(r.type, r.amount)
}

/** The line under a pending row's name: "Pending", then the account unless the list is that account's. */
export const pendingSub = (accountName: string | undefined) => ['Pending', accountName].filter(Boolean).join(' · ')
