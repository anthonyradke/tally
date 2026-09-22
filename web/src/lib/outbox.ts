// Offline outbox: new entries saved while Tally is unreachable wait in localStorage and post themselves when it's
// back. Each carries a client id, so a retry after a lost response returns the row the server already wrote
// instead of adding a second one (app/api.py `_landed`). Edits, deletes and receipts still need a connection.
import { useSyncExternalStore } from 'react'
import { api, ApiError, unreachable, type TxnInput } from '@/api/client'

export interface Queued { cid: string; lines: TxnInput[]; label: string; at: string; error?: string }

const KEY = 'tally.outbox'
const listeners = new Set<() => void>()
let items: Queued[] = read()

function read(): Queued[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
function write(next: Queued[]) {
  items = next
  localStorage.setItem(KEY, JSON.stringify(next))
  listeners.forEach((l) => l())
}
// Another tab (or the installed app next to a Safari tab) changed the queue.
window.addEventListener('storage', (e) => { if (e.key === KEY) { items = read(); listeners.forEach((l) => l()) } })

export const newClientId = (): string =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

export function useOutbox(): Queued[] {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => items)
}

export const enqueue = (q: Omit<Queued, 'at'>) => write([...items.filter((x) => x.cid !== q.cid), { ...q, at: new Date().toISOString() }])
export const discard = (cid: string) => write(items.filter((x) => x.cid !== cid))

export const send = (lines: TxnInput[], cid: string) =>
  lines.length > 1 ? api.createSplit(lines, cid) : api.createTxn(lines[0], cid)

let running: Promise<number> | null = null

/** Post everything queued, oldest first. Stops at the first unreachable error (still offline); a refusal (say the
 *  category was deleted meanwhile) stays queued with its reason so it can be discarded. Returns how many landed. */
export function flush(): Promise<number> {
  if (running) return running
  running = (async () => {
    let sent = 0
    for (const q of [...items]) {
      try {
        await send(q.lines, q.cid)
        discard(q.cid); sent++
      } catch (e) {
        if (unreachable(e)) break
        write(items.map((x) => (x.cid === q.cid ? { ...x, error: e instanceof ApiError ? e.errors.join(' ') : String(e) } : x)))
      }
    }
    return sent
  })().finally(() => { running = null })
  return running
}
