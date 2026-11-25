// While Tally is in the app switcher it's covered (blurred, with its icon), so balances never show in the switcher.
// Locking with Face ID is iOS's own: touch and hold Tally's icon and choose Require Face ID (iOS 18). Tally has no
// lock of its own.
import { AppState } from 'react-native'
import { create } from 'zustand'

export const useCover = create<{ cover: boolean }>(() => ({ cover: false }))

let started = false
export function watchCover() {
  if (started) return
  started = true
  AppState.addEventListener('change', (s) => useCover.setState({ cover: s !== 'active' }))
}
