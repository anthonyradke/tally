// Things the New design does to entries, each with its confirmation and Undo.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { api, type Txn } from '@/lib/api'
import { refreshBank } from '@/lib/bank'
import { queryClient } from '@/lib/data'
import { failure, success, warning } from './haptics'
import { notify, reasonOf } from './notify'

/** Bumped when a logo is hidden or shown again, so every logo asks the server afresh. Kept on the phone: images are
 *  cached on disk by address, and an epoch that started over at launch brought a hidden logo back. */
export const useLogoEpoch = create<{ n: number }>(() => ({ n: 0 }))
const EPOCH_KEY = 'tally.logoEpoch'

export async function loadLogoEpoch() {
  try {
    const n = Number(await AsyncStorage.getItem(EPOCH_KEY))
    if (Number.isFinite(n) && n > useLogoEpoch.getState().n) useLogoEpoch.setState({ n })
  } catch { /* start from 0 */ }
}

function bump() {
  const n = useLogoEpoch.getState().n + 1
  useLogoEpoch.setState({ n })
  AsyncStorage.setItem(EPOCH_KEY, String(n)).catch(() => {})
  queryClient.invalidateQueries({ queryKey: ['logo-color'] }).catch(() => {}) // the brand wash and card colors follow
}

// Entries being deleted, and deleted ones still on screen until the lists refresh: a second tap (the swipe action
// stays open, the menu offers Delete too) is ignored instead of failing and replacing the Undo.
const busy = new Set<number>()

/** The name a notice uses for an entry. */
const named = (what: string | undefined, fallback: string) => (what?.trim() ? `${fallback} ${what.trim()}` : fallback)

export async function deleteEntry(t: Pick<Txn, 'id'> & { what?: string }) {
  if (busy.has(t.id)) return
  busy.add(t.id)
  let row: Txn
  try {
    row = await api.deleteTxn(t.id)
  } catch (e) {
    busy.delete(t.id)
    failure()
    notify({ text: reasonOf(e, "Couldn't delete it"), symbol: 'exclamationmark.triangle.fill', hue: 'orange' })
    return
  }
  warning()
  notify({ text: named(row.what ?? t.what, 'Deleted'), symbol: 'trash.fill', hue: 'red', action: { label: 'Undo', run: async () => {
    await api.restore([row])
    busy.delete(row.id)
    success()
    await refreshBank()
  } } })
  try { await refreshBank() } finally { setTimeout(() => busy.delete(t.id), 1500) } // the row has left the lists by then
}

export async function hideLogo(name: string) {
  try {
    await api.hideLogo(name)
    bump()
    notify({ text: 'Logo Hidden', symbol: 'eye.slash', hue: 'gray', action: { label: 'Undo', run: async () => { await api.showLogo(name); bump() } } })
  } catch (e) {
    failure()
    notify({ text: reasonOf(e, "Couldn't hide the logo"), symbol: 'exclamationmark.triangle.fill', hue: 'orange' })
  }
}
