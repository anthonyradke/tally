// Things the New design does to entries, each with its confirmation and Undo.
import { create } from 'zustand'
import { api, type Txn } from '@/lib/api'
import { refreshBank } from '@/lib/bank'
import { failure, success, warning } from './haptics'
import { notify } from './ui/Notice'

/** Bumped when a logo is hidden or shown again, so every logo asks the server afresh. */
export const useLogoEpoch = create<{ n: number }>(() => ({ n: 0 }))
const bump = () => useLogoEpoch.setState((s) => ({ n: s.n + 1 }))

export async function deleteEntry(t: Pick<Txn, 'id'>) {
  try {
    const row = await api.deleteTxn(t.id)
    warning()
    await refreshBank()
    notify({ text: 'Deleted', symbol: 'trash.fill', hue: 'red', action: { label: 'Undo', run: async () => { await api.restore([row]); await refreshBank(); success() } } })
  } catch {
    failure()
    notify({ text: "Couldn't delete it", symbol: 'exclamationmark.triangle.fill', hue: 'orange' })
  }
}

export async function hideLogo(name: string) {
  try {
    await api.hideLogo(name)
    bump()
    notify({ text: 'Logo removed', symbol: 'photo', hue: 'gray', action: { label: 'Undo', run: async () => { await api.showLogo(name); bump() } } })
  } catch {
    failure()
  }
}
