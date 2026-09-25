// Offline outbox: new entries saved while Tally is unreachable wait on the phone and post themselves when it's back.
// Each carries a client id, so a retry after a lost response returns the row the server already wrote instead of
// adding a second one (app/api.py `_landed`). Edits, deletes and receipts still need a connection.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { api, ApiError, unreachable, type Txn, type TxnInput } from './api'
import { invalidateAll } from './data'

export interface Queued { cid: string; lines: TxnInput[]; label: string; at: string; error?: string }

const KEY = 'tally.outbox'

interface OutboxState { items: Queued[] }
export const useOutbox = create<OutboxState>(() => ({ items: [] }))

function write(next: Queued[]) {
  useOutbox.setState({ items: next })
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {})
}

export async function loadOutbox() {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]')
    if (Array.isArray(v)) useOutbox.setState({ items: v })
  } catch { /* corrupt queue: start empty */ }
}

export const newClientId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

const items = () => useOutbox.getState().items
export const enqueue = (q: Omit<Queued, 'at'>) => write([...items().filter((x) => x.cid !== q.cid), { ...q, at: new Date().toISOString() }])
export const discard = (cid: string) => write(items().filter((x) => x.cid !== cid))

export const send = (lines: TxnInput[], cid: string) =>
  lines.length > 1 ? api.createSplit(lines, cid) : api.createTxn(lines[0], cid)

export const QUEUED = 'Saved on your phone. It will reach Tally when you are back on Tailscale.'

/** Adds new entries now, or keeps them on the phone when Tally can't be reached (then it returns null). A refusal
 *  from Tally still throws. */
export async function sendOrQueue(lines: TxnInput[], label: string): Promise<Txn[] | null> {
  const cid = newClientId()
  try {
    const r = await send(lines, cid)
    return Array.isArray(r) ? r : [r]
  } catch (e) {
    if (!unreachable(e)) throw e
    enqueue({ cid, lines, label })
    return null
  }
}

let running: Promise<number> | null = null

/** Post everything queued, oldest first. Stops at the first unreachable error (still offline); a refusal (say the
 *  category was deleted meanwhile) stays queued with its reason so it can be discarded. Returns how many landed. */
export function flush(): Promise<number> {
  if (running) return running
  running = (async () => {
    let sent = 0
    for (const q of [...items()]) {
      try {
        await send(q.lines, q.cid)
        discard(q.cid); sent++
      } catch (e) {
        if (unreachable(e)) break
        write(items().map((x) => (x.cid === q.cid ? { ...x, error: e instanceof ApiError ? e.errors.join(' ') : String(e) } : x)))
      }
    }
    if (sent) await invalidateAll()
    return sent
  })().finally(() => { running = null })
  return running
}
