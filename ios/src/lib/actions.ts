// Row actions shared by every list: delete with undo, duplicate to today, repeat, make a quick action.
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { api, ApiError, type Txn } from './api'
import { invalidateAll } from './data'
import { todayISO } from './dates'
import { dollarsText } from './forms'
import { formatCents } from './money'
import { markFresh } from './motion'
import { play } from './sound'
import { toast } from './toast'
import { nextMonthly } from './txn'

const why = (e: unknown) => (e instanceof ApiError ? e.errors.join(' ') : 'Tally is unreachable. Check Tailscale.')

/** Resolves true once the rows are gone, false if the delete failed (the toast says why). */
export async function deleteTxns(rows: Txn[]): Promise<boolean> {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
  play('remove')
  try {
    const gone = rows.length === 1 ? [await api.deleteTxn(rows[0].id)] : (await api.bulk({ ids: rows.map((r) => r.id), action: 'delete' })).deleted ?? []
    await invalidateAll()
    if (!gone.length) { toast({ text: 'Those entries were already gone.' }); return true }
    toast({
      // The amount tells apart two Coffees on the same day.
      text: gone.length === 1 ? `Deleted ${gone[0].what || 'entry'}, ${formatCents(Math.abs(gone[0].amount))}` : `Deleted ${gone.length} entries`,
      action: { label: 'Undo', run: () => undo(gone) },
    })
    return true
  } catch (e) {
    toast({ text: why(e), tone: 'error' })
    return false
  }
}

/** Put deleted rows back. Failing says so: the toast's button has nothing to catch it, so Undo used to just do
 *  nothing when the phone was offline. */
async function undo(gone: Txn[]) {
  try {
    await api.restore(gone)
    play('undo')
    markFresh(gone.map((t) => t.id)) // they unfold back into place
    await invalidateAll()
  } catch (e) {
    toast({ text: e instanceof ApiError ? e.errors.join(' ') : "Couldn't undo: Tally is unreachable.", tone: 'error' })
  }
}

/** Opens the composer: the new-entry steps, or the form for an existing entry. A second call while the first modal is still presenting (a quick double tap) is dropped, so
 *  it never stacks two copies of the same entry. */
let opened = 0
export function openEntry(id?: number, mode?: 'duplicate') {
  const now = Date.now()
  if (now - opened < 700) return
  opened = now
  if (!id) router.push('/new')
  else router.push({ pathname: '/entry', params: { id: String(id), ...(mode ? { mode } : {}) } })
}

/** What tapping an Added toast opens: the entry, or for a split its lines together in Activity, since the editor holds
 *  one line and changing it there alone would unbalance the rest. */
export function openAdded(saved: Txn[]): (() => void) | undefined {
  const group = saved.length > 1 ? saved[0].split_group : null
  if (group) return () => { router.push({ pathname: '/activity', params: { group } }) }
  return saved[0] ? () => openEntry(saved[0].id) : undefined
}

/** "Add another" in the toast after Add: the next entry starts on the same day, and from the account the last one was
 *  opened from (an account's page, or Activity filtered to one). */
export const addAnother = (date: string, from?: string) => ({
  label: 'Add another', run: () => { router.push({ pathname: '/new', params: { date, ...(from ? { from } : {}) } }) },
})

/** A monthly template's fields from an entry, from the same day next time round. `anchor_day` is the entry's day:
 *  one from Jan 31 starts on Feb 28 and still comes back to the 31st. `today` is never taken as earlier than the
 *  phone's date (a list's bootstrap can be from yesterday). */
export function repeatFields(t: Txn, today: string, label: string) {
  const now = today > todayISO() ? today : todayISO()
  return { label, what: t.what || label, category_id: t.category_id, from_account_id: t.from_id, to_account_id: t.to_id,
    amount: dollarsText(t.amount), freq: 'monthly', next_date: nextMonthly(t.date, now), anchor_day: Number(t.date.slice(8, 10)) }
}

/** A new recurring template filled in from an entry. Nothing is added until it's saved. */
export function repeatEntry(t: Txn, today: string, label: string) {
  router.push({ pathname: '/edit', params: { kind: 'recurring', prefill: JSON.stringify(repeatFields(t, today, label)) } })
}

/** A new quick action filled in from an entry. */
export function quickFromEntry(t: Txn, label: string) {
  router.push({ pathname: '/edit', params: { kind: 'quick', prefill: JSON.stringify({
    label, category_id: t.category_id, from_account_id: t.from_id, to_account_id: t.to_id, amount: dollarsText(t.amount) }) } })
}

/** Activity showing one tag's entries. */
export const openTag = (tag: string) => router.push({ pathname: '/activity', params: { tag } })
