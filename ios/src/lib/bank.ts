// Bank sync on the phone (Tally Lab for now): whether the server has it, the inbox of bank rows no entry stands for
// yet, and connecting a bank through Plaid Link. The server does the work (app/bank.py); this asks and shows.
import { useQuery } from '@tanstack/react-query'
import { api, ApiError, type Account, type BankRow, type BankStatus } from './api'
import { invalidateAll, queryClient } from './data'

/** The server's bank sync, or null when it has none (404: no Plaid keys, as on the real Tally). */
async function status(): Promise<BankStatus | null> {
  try {
    return await api.bank.status()
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export const useBank = () => useQuery({ queryKey: ['bank'], queryFn: status, staleTime: 60_000, retry: false })

/** True once the server has said it does bank sync. */
export const useBankOn = () => !!useBank().data

export const useBankInbox = (enabled = true) =>
  useQuery({ queryKey: ['bank', 'inbox'], queryFn: api.bank.inbox, enabled, staleTime: 15_000 })

/** After anything that changes bank rows or entries: the inbox, the status count, and every list of entries. */
export const refreshBank = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['bank'] }), invalidateAll()])

export const cachedRow = (id: number): BankRow | undefined =>
  queryClient.getQueryData<BankRow[]>(['bank', 'inbox'])?.find((r) => r.id === id)

/** How a bank row reads on its account, like the account's own statement (DESIGN.md): on a cash account + for money
 *  in and − for money out; on a card or loan, charges plain and credits as green +. */
export function bankFigure(r: Pick<BankRow, 'amount'>, a: Account | undefined): { text: number; sign: 'plus' | 'minus' | 'plain' } {
  const out = r.amount > 0
  if (!out) return { text: -r.amount, sign: 'plus' }
  return { text: r.amount, sign: a && a.kind !== 'cash' ? 'plain' : 'minus' }
}

export const CONFIDENCE: Record<string, string> = { sure: 'Sure', likely: 'Likely', guess: 'Best guess', unknown: 'Needs you' }

type PlaidModule = typeof import('react-native-plaid-link-sdk')

/** Opens Plaid Link with a token from the server and resolves with the public token, or null if it was closed.
 *  The native module is loaded only here, so the web preview (which has no Plaid Link) still runs. */
export async function openPlaidLink(linkToken: string): Promise<string | null> {
  if (process.env.EXPO_OS !== 'ios' && process.env.EXPO_OS !== 'android') throw new Error('Connect a bank from the phone.')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const plaid: PlaidModule = require('react-native-plaid-link-sdk')
  return new Promise((resolve, reject) => {
    plaid.createPlaidLinkSession({
      token: linkToken,
      onSuccess: (s) => resolve(s.publicToken),
      onExit: (x) => (x.error ? reject(new Error(x.error.displayMessage || x.error.errorMessage || 'Plaid closed with an error.')) : resolve(null)),
      onEvent: () => {},
    }).then((session) => session.open(true)).catch(reject)
  })
}
