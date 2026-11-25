// Bank sync on the phone (Tally Lab for now): whether the server has it, the inbox of bank rows no entry stands for
// yet, and connecting a bank through Plaid Link. The server does the work (app/bank.py); this asks and shows.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError, type Account, type BankConnected, type BankRow, type BankStatus } from './api'
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

/** Opens Plaid Link with a token from the server and resolves with the public token ('' when a session that can
 *  add several banks ends: they're collected by link token instead), or null if it was closed. The native module is
 *  loaded only here, so the web preview (which has no Plaid Link) still runs. */
export async function openPlaidLink(linkToken: string): Promise<string | null> {
  if (process.env.EXPO_OS !== 'ios' && process.env.EXPO_OS !== 'android') throw new Error('Connect a bank from the phone.')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const plaid: PlaidModule = require('react-native-plaid-link-sdk')
  return new Promise((resolve, reject) => {
    plaid.createPlaidLinkSession({
      token: linkToken,
      onSuccess: (s) => resolve(s.publicToken ?? ''),
      onExit: (x) => (x.error ? reject(new Error(x.error.displayMessage || x.error.errorMessage || 'Plaid closed with an error.')) : resolve(null)),
      onEvent: () => {},
    }).then((session) => session.open(true)).catch(reject)
  })
}

/** Adds banks through Plaid Link: as many as you sign in to in one go where Plaid allows it, else one. Resolves
 *  with what was connected, or null when nothing was. */
export async function linkBanks(): Promise<BankConnected | null> {
  const { link_token, multi } = await api.bank.linkToken()
  let pt: string | null = null
  let failed: unknown = null
  try {
    pt = await openPlaidLink(link_token)
  } catch (e) {
    if (!multi) throw e
    failed = e // a multi-bank session that errors late may still have added some
  }
  if (multi) {
    const r = await api.bank.connect({ link_token })
    if (r.items.length) return r
    if (failed) throw failed
    return null
  }
  return pt ? api.bank.connect({ public_token: pt }) : null
}

/** What the check-in last showed: the day, and the newest bank row in it. */
export interface Seen { day: string; maxId: number }

/** Whether opening Tally should bring up New from the bank: something waits (a row to add, an account to place),
 *  and either it's the first look today or a row came in since the last one. */
export function shouldCheckIn(rows: Pick<BankRow, 'id' | 'pending'>[], asks: number, seen: Seen | null, today: string): boolean {
  const posted = rows.filter((r) => !r.pending)
  if (!posted.length && !asks) return false
  if (!seen || seen.day !== today) return true
  return posted.some((r) => r.id > seen.maxId)
}

export const newestId = (rows: Pick<BankRow, 'id' | 'pending'>[]) => rows.reduce((m, r) => (r.pending ? m : Math.max(m, r.id)), 0)

const seenKey = () => 'tally.bankSeen'

export async function loadSeen(): Promise<Seen | null> {
  try { return JSON.parse((await AsyncStorage.getItem(seenKey())) ?? 'null') as Seen | null } catch { return null }
}

export const saveSeen = (s: Seen) => AsyncStorage.setItem(seenKey(), JSON.stringify(s)).catch(() => {})

/** Checks the banks (the server skips it when it did within half an hour) and returns what's waiting, or null on a
 *  server without bank sync. */
export async function freshBank(): Promise<{ status: BankStatus; rows: BankRow[] } | null> {
  const s = await queryClient.fetchQuery({ queryKey: ['bank'], queryFn: status, staleTime: 0, retry: false })
  if (!s) return null
  await api.bank.sync(30 * 60).catch(() => {})
  const [st, rows] = await Promise.all([
    queryClient.fetchQuery({ queryKey: ['bank'], queryFn: status, staleTime: 0, retry: false }),
    queryClient.fetchQuery({ queryKey: ['bank', 'inbox'], queryFn: api.bank.inbox, staleTime: 0 }),
  ])
  return st ? { status: st, rows } : null
}
