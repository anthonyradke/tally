// One-tap actions on a recurring template, shared by its editor and the swipe actions on Settings → Recurring. Each
// acts at once and offers Undo (no confirm dialogs anywhere).
import { api, type AdminRecurring, type Txn } from './api'
import { write } from './admin'
import { dayLabel, nextDue } from './dates'
import { recurringBody } from './forms'
import { play } from './sound'
import { toast } from './toast'

/** The next date that will happen, as the app shows it. */
export const dueOf = (r: AdminRecurring) => r.next_due ?? r.next_date

/** "Skip Tue, Dec 1" (or "Skip tomorrow's"). */
export function skipLabel(r: AdminRecurring, today: string): string {
  const l = dayLabel(dueOf(r), today)
  return l === 'Today' || l === 'Tomorrow' ? `Skip ${l.toLowerCase()}'s` : `Skip ${l}`
}

/** Pause a running template (its entries ahead come out) or resume a paused one (missed dates are skipped). Undo
 *  starts from the template as the change left it, and keeps its schedule (`move: false`): built from `r`, it sent
 *  the date from before the pause, which read as a move and dropped the bills already scheduled. */
export async function togglePause(r: AdminRecurring, today: string): Promise<boolean> {
  const set = (x: AdminRecurring, active: boolean) => api.saveRecurring({ ...recurringBody(x), active }, r.id)
  const pausing = !!r.active
  let after: AdminRecurring | undefined
  const ok = await write(async () => { after = await set(r, !pausing) })
  if (!ok || !after) return false
  const now = after
  play('toggle')
  toast({
    text: pausing ? `Paused ${r.label}` : `${r.label} resumes ${nextDue(now.next_due ?? now.next_date, today)}`,
    action: { label: 'Undo', run: async () => { await write(() => set(now, pausing)) } },
  })
  return true
}

/** Skip the next date only, leaving the template as it is. */
export async function skipNext(r: AdminRecurring, today: string): Promise<boolean> {
  let out: { date: string; rows: Txn[] } | undefined
  const ok = await write(async () => { out = await api.skipRecurring(r.id) })
  if (!ok || !out) return false
  const { date, rows } = out
  // `date` is the date its row was posted for; a row moved by hand is on its own day.
  toast({ text: `Skipping ${r.label} ${nextDue(rows[0]?.date ?? date, today).replace(/^next /, 'on ')}`, action: { label: 'Undo', run: async () => {
    await write(() => (rows.length ? api.restore(rows) : api.unskipRecurring(r.id, date)))
  } } })
  return true
}

/** Delete the template and its entries still ahead; Undo brings back both. */
export async function removeRecurring(r: AdminRecurring): Promise<boolean> {
  let back: (() => Promise<unknown>) | undefined
  const ok = await write(async () => {
    const gone = await api.deleteRecurring(r.id) // nothing comes back when it was already gone
    if (gone) back = async () => { await api.restoreRecurring(gone.template); if (gone.rows.length) await api.restore(gone.rows) }
  })
  if (!ok) return false
  play('remove')
  toast({ text: `Deleted ${r.label}`, action: back ? { label: 'Undo', run: async () => { await write(back!); play('undo') } } : undefined })
  return true
}
