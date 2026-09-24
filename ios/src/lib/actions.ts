// Row actions shared by every list: delete with undo, duplicate to today.
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { api, ApiError, type Txn } from './api'
import { invalidateAll } from './data'
import { toast } from './toast'

const why = (e: unknown) => (e instanceof ApiError ? e.errors.join(' ') : 'Tally is unreachable. Check Tailscale.')

export async function deleteTxns(rows: Txn[]) {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
  try {
    const gone = rows.length === 1 ? [await api.deleteTxn(rows[0].id)] : (await api.bulk({ ids: rows.map((r) => r.id), action: 'delete' })).deleted ?? []
    await invalidateAll()
    toast({
      text: gone.length === 1 ? `Deleted ${gone[0].what || 'entry'}` : `Deleted ${gone.length} entries`,
      action: { label: 'Undo', run: async () => { await api.restore(gone); await invalidateAll() } },
    })
  } catch (e) {
    toast({ text: why(e), tone: 'error' })
  }
}

export const openEntry = (id?: number, mode?: 'duplicate') =>
  router.push({ pathname: '/entry', params: id ? { id: String(id), ...(mode ? { mode } : {}) } : {} })
