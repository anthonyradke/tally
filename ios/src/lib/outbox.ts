// Offline outbox: new entries saved while Tally is unreachable wait on the phone and post themselves when it's back.
// Each carries a client id, so a retry after a lost response returns the row the server already wrote instead of
// adding a second one (app/api.py `_landed`). Edits, deletes and receipts still need a connection.
import { useMemo } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { api, ApiError, locked, unreachable, type Txn, type TxnInput } from './api'
import { invalidateAll } from './data'
import { getServer, useServer } from './server'

/** `url`: the server it was saved for. It only ever goes there (Tally and Tally Lab keep separate outboxes, too). */
export interface Queued { cid: string; lines: TxnInput[]; label: string; at: string; error?: string; url?: string }

/** Why entries are waiting: no answer from Tally ('offline') or Tally refused the token or login ('token'). */
export type Blocked = 'offline' | 'token' | null

const KEY = 'tally.outbox'

interface OutboxState { items: Queued[]; blocked: Blocked }
export const useOutbox = create<OutboxState>(() => ({ items: [], blocked: null }))

function write(next: Queued[]) {
  useOutbox.setState({ items: next })
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {})
}

export async function loadOutbox() {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]')
    useOutbox.setState({ items: Array.isArray(v) ? v : [] })
  } catch { /* corrupt queue: start empty */ }
}

export const newClientId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

const items = () => useOutbox.getState().items
export const enqueue = (q: Omit<Queued, 'at' | 'url'>) => write([...items().filter((x) => x.cid !== q.cid), { ...q, at: new Date().toISOString(), url: getServer() }])
/** Throws a queued entry away for good (by its `cid`). */
export const discard = (cid: string) => write(items().filter((x) => x.cid !== cid))

export const send = (lines: TxnInput[], cid: string) =>
  lines.length > 1 ? api.createSplit(lines, cid) : api.createTxn(lines[0], cid)

export const QUEUED = 'Saved on your phone. It will reach Tally when you are back on Tailscale.'
export const QUEUED_TOKEN = 'Saved on your phone. Check the token in Settings.'

/** What a waiting entry is held up by, in a short line for a footer or a notice. */
export function blockedText(b: Blocked): string | null {
  return b === 'token' ? 'Tally refused the token. Check it in Settings.' : b === 'offline' ? "Tally can't be reached right now." : null
}

const blockOf = (e: unknown): Blocked => (locked(e) ? 'token' : unreachable(e) ? 'offline' : null)

/** Adds new entries now, or keeps them on the phone when Tally can't be reached or refused the token (then it
 *  returns null, and `useOutbox.getState().blocked` says which; `queuedText()` words it). A refusal of the entry
 *  itself still throws. */
export async function sendOrQueue(lines: TxnInput[], label: string): Promise<Txn[] | null> {
  const cid = newClientId()
  try {
    const r = await send(lines, cid)
    useOutbox.setState({ blocked: null })
    return Array.isArray(r) ? r : [r]
  } catch (e) {
    const b = blockOf(e)
    if (!b) throw e
    useOutbox.setState({ blocked: b })
    enqueue({ cid, lines, label })
    return null
  }
}

/** The notice for an entry `sendOrQueue` just kept on the phone. */
export const queuedText = () => (useOutbox.getState().blocked === 'token' ? QUEUED_TOKEN : QUEUED)

let running: Promise<number> | null = null

/** Post everything queued, oldest first. Stops at the first unreachable error (still offline) or a refused token; a
 *  refusal of the entry itself (say the category was deleted meanwhile) stays queued with its reason so it can be
 *  discarded. Those are only tried again with `retry` (Send now), not every 20 s. Returns how many landed. */
export function flush(retry = false): Promise<number> {
  if (running) return retry ? running.then(() => flush(true)) : running // Send now during the 20 s flush still retries
  running = (async () => {
    let sent = 0
    let blocked: Blocked = null
    for (const q of [...items()]) {
      if (!items().some((x) => x.cid === q.cid)) continue // discarded while an earlier one was sending
      if (q.error && !retry) continue
      if (q.url && q.url !== getServer()) continue // saved for another address: never sent anywhere else
      try {
        await send(q.lines, q.cid)
        discard(q.cid); sent++
      } catch (e) {
        blocked = blockOf(e)
        if (blocked) break
        write(items().map((x) => (x.cid === q.cid ? { ...x, error: e instanceof ApiError ? e.errors.join(' ') : String(e) } : x)))
      }
    }
    useOutbox.setState({ blocked })
    if (sent) await invalidateAll()
    return sent
  })().finally(() => { running = null })
  return running
}

/** One queued entry as a list shows it. `amount`: cents as the entry has it (a split's lines added up); `date`: the
 *  entry's date (YYYY-MM-DD); `saved`: when it was queued (ISO time); `error`: why Tally refused it (only failed
 *  ones); `elsewhere`: saved for another server address, so it won't be sent until that address is back. */
export interface OutboxEntry { cid: string; what: string; amount: number; date: string; saved: string; lines: number; error: string | null; elsewhere: boolean }

export function outboxEntry(q: Queued, server: string): OutboxEntry {
  return {
    cid: q.cid, what: q.label || q.lines[0]?.what || 'Entry', amount: q.lines.reduce((n, l) => n + l.amount, 0),
    date: q.lines[0]?.date ?? q.at.slice(0, 10), saved: q.at, lines: q.lines.length, error: q.error ?? null,
    elsewhere: !!q.url && q.url !== server,
  }
}

/** What Settings shows of the outbox: entries still waiting to be sent, entries Tally refused (each with its reason),
 *  and why the waiting ones are held up. Pair with `sendNow` and `discard(cid)`. */
export function useOutboxEntries(): { waiting: OutboxEntry[]; failed: OutboxEntry[]; blocked: Blocked; reason: string | null } {
  const list = useOutbox((s) => s.items)
  const blocked = useOutbox((s) => s.blocked)
  const server = useServer((s) => s.url)
  return useMemo(() => {
    const all = list.map((q) => outboxEntry(q, server))
    return { waiting: all.filter((x) => !x.error), failed: all.filter((x) => x.error), blocked, reason: blockedText(blocked) }
  }, [list, blocked, server])
}

/** Send now: tries every entry again, refused ones too. `sent`: how many landed; `failed`: how many Tally refused
 *  (still queued, with their reasons); `blocked`: why the rest are still waiting, if they are. */
export async function sendNow(): Promise<{ sent: number; failed: number; blocked: Blocked }> {
  const sent = await flush(true)
  const s = useOutbox.getState()
  return { sent, failed: s.items.filter((x) => x.error).length, blocked: s.blocked }
}
