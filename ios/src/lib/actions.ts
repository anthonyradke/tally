// Row actions shared by every list: delete with undo, duplicate to today.
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { api, ApiError, type Txn } from './api'
import { invalidateAll } from './data'
import { markFresh } from './motion'
import { toast } from './toast'

const why = (e: unknown) => (e instanceof ApiError ? e.errors.join(' ') : 'Tally is unreachable. Check Tailscale.')

/** Resolves true once the rows are gone, false if the delete failed (the toast says why). */
export async function deleteTxns(rows: Txn[]): Promise<boolean> {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
  try {
    const gone = rows.length === 1 ? [await api.deleteTxn(rows[0].id)] : (await api.bulk({ ids: rows.map((r) => r.id), action: 'delete' })).deleted ?? []
    await invalidateAll()
    toast({
      text: gone.length === 1 ? `Deleted ${gone[0].what || 'entry'}` : `Deleted ${gone.length} entries`,
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
    markFresh(gone.map((t) => t.id)) // they unfold back into place
    await invalidateAll()
  } catch (e) {
    toast({ text: e instanceof ApiError ? e.errors.join(' ') : "Couldn't undo: Tally is unreachable.", tone: 'error' })
  }
}

export const openEntry = (id?: number, mode?: 'duplicate') =>
  router.push({ pathname: '/entry', params: id ? { id: String(id), ...(mode ? { mode } : {}) } : {} })
