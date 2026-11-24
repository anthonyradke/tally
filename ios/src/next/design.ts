// Which design the app shows: Classic (src/app outside next/) or New (src/app/next). A phone setting, the same for
// Tally and Lab. Switching replaces the whole screen stack with the other design's home.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { create } from 'zustand'

export type Design = 'classic' | 'new'
const KEY = 'tally.design'

export const useDesign = create<{ design: Design }>(() => ({ design: 'classic' }))

export async function loadDesign() {
  try {
    const v = await AsyncStorage.getItem(KEY)
    if (v === 'new' || v === 'classic') useDesign.setState({ design: v })
  } catch { /* first run: Classic */ }
}

export function setDesign(d: Design) {
  useDesign.setState({ design: d })
  AsyncStorage.setItem(KEY, d).catch(() => {})
  try { if (router.canDismiss()) router.dismissAll() } catch { /* nothing open */ }
  router.replace(d === 'new' ? '/next' : '/')
}
