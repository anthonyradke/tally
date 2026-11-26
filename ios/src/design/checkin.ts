// The bank check-in's rules, apart from the screen: what each waiting row would add with the picks made on it, how
// Add All sends them, which Tally accounts a bank account can be, and when the check-in may come up by itself.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ApiError, type BankAccept, type BankRow, type Category, type Kind } from '@/lib/api'
import type { Seen } from '@/lib/bank'

/** What was chosen on a row: `undefined` keeps Tally's guess. */
export interface RowPick { cat?: number | null; other?: number | null }

const MOVES = new Set(['Transfer', 'Loan', 'Saving'])

/** A bank row with its picks: the category and other account, whether it can be added, and the body to send. `same`:
 *  nothing changed from the guess, so the server's own guess is sent (an empty body). */
export function rowPlan(r: Pick<BankRow, 'account_id' | 'amount' | 'guess'>, pick: RowPick | undefined, catOf: (id: number) => Pick<Category, 'type'> | undefined) {
  const g = r.guess
  const out = r.amount > 0
  const guessOther = g ? (g.from_id === r.account_id ? g.to_id : g.from_id) : null
  const cat = pick?.cat !== undefined ? pick.cat : g?.category_id ?? null
  const other = pick?.other !== undefined ? pick.other : guessOther
  const type = cat !== null ? catOf(cat)?.type : undefined
  const moving = !!type && MOVES.has(type)
  const needsOther = type === 'Transfer' || (moving && !out)
  const ready = cat !== null && (!needsOther || other !== null)
  const same = cat === (g?.category_id ?? null) && (!moving || other === guessOther)
  const sides = moving ? (out ? { from_id: r.account_id, to_id: other } : { from_id: other, to_id: r.account_id }) : {}
  const body: BankAccept = same ? {} : { category_id: cat ?? undefined, ...sides }
  return { cat, other, out, moving, needsOther, ready, same, body }
}

/** Add All: rows left as guessed go in one request by id; rows with picks of their own go one by one with them
 *  (the bulk route only takes ids). Rows that aren't ready are left. */
export function addAllPlan(rows: (Pick<BankRow, 'id' | 'account_id' | 'amount' | 'guess'>)[], picks: Record<number, RowPick>, catOf: (id: number) => Pick<Category, 'type'> | undefined) {
  const ids: number[] = []
  const each: { id: number; body: BankAccept }[] = []
  for (const r of rows) {
    const plan = rowPlan(r, picks[r.id], catOf)
    if (!plan.ready) continue
    if (plan.same) ids.push(r.id)
    else each.push({ id: r.id, body: plan.body })
  }
  return { ids, each, count: ids.length + each.length }
}

/** The Tally account kinds a bank account can be (app/bank.py `kinds_for`): an HSA is a depository at the bank and
 *  often an investment in Tally. Empty when Plaid's type says nothing useful. */
export function kindsFor(type: string | null, subtype: string | null): Kind[] {
  if (type === 'credit') return ['card']
  if (type === 'depository') return subtype === 'hsa' ? ['cash', 'investment'] : ['cash']
  return type === 'loan' || type === 'investment' ? [type] : []
}

/** A refusal that only means someone got there first: the row was already added or skipped (a second tap, the other
 *  side of a transfer) or is gone. Refresh instead of showing an error. */
export const already = (e: unknown) => e instanceof ApiError && (e.status === 409 || e.status === 404)

/** A refusal's words for a notice. */
export const why = (e: unknown, fallback: string) => (e instanceof ApiError ? e.errors.join(' ') : e instanceof Error ? e.message : fallback)

// ---------- when the check-in comes up by itself ----------

const seenKey = (server: string) => `tally.bankSeen@${server}`

/** What the check-in last showed on this server (each server has its own banks and row ids). */
export async function loadSeenFor(server: string): Promise<Seen | null> {
  try { return JSON.parse((await AsyncStorage.getItem(seenKey(server))) ?? 'null') as Seen | null } catch { return null }
}

export const saveSeenFor = (server: string, s: Seen) => AsyncStorage.setItem(seenKey(server), JSON.stringify(s)).catch(() => {})

/** Minimum time between two looks at the banks from the app coming back to the front. */
export const RECHECK_MS = 5 * 60_000
/** A look that took longer than this is stale by the time it's back: the person has moved on. */
export const PATIENCE_MS = 8_000

/** Whether a finished look may bring up the sheet: still on the same tab's main screen it started on, and quickly
 *  enough that it isn't interrupting something begun since. */
export function mayPop(o: { roots: Set<string>; startPath: string; path: string; startedAt: number; now: number; active: boolean }): boolean {
  return o.active && o.roots.has(o.path) && o.path === o.startPath && o.now - o.startedAt <= PATIENCE_MS
}

/** Whether coming back to the front should look at the banks: only after the app was really in the background (not
 *  Control Center or a Face ID prompt, which only pass through "inactive"), and not again within RECHECK_MS. */
export const shouldLook = (wasBackground: boolean, last: number, now: number) => wasBackground && now - last >= RECHECK_MS

/** What Settings › Banks says after Check Now: a bank that couldn't be checked first, then rows waiting for review,
 *  and only then "Up to Date". */
export function checkSummary(synced: Record<string, { added?: number; error?: string }>, items: { id: number; institution: string | null }[], waiting: number, added = 0): { kind: 'failed' | 'review' | 'ok'; text: string } {
  const failed = Object.entries(synced).filter(([, x]) => x.error).map(([id]) => items.find((i) => String(i.id) === id)?.institution ?? 'a Bank')
  if (failed.length) return { kind: 'failed', text: failed.length === 1 ? `Couldn’t Check ${failed[0]}` : `Couldn’t Check ${failed.length} Banks` }
  if (waiting) return { kind: 'review', text: `${waiting} to Review` }
  return { kind: 'ok', text: added ? `${added} Added · Up to Date` : 'Up to Date' }
}
