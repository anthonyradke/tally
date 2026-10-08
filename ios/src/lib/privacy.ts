// Hide amounts: every money figure reads "$•••" until it's switched off again (Home's eye button, or Settings). For
// showing the app to someone, or opening it on the train. It's a setting on this phone. Masking happens where text is
// drawn (Txt, the rolling figures, the scrub figure), so no screen has to know about it. Screens where you type an
// amount (a new entry, an edit, reconcile) wrap themselves in <Reveal> and always show figures.
import { createContext, useContext } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'

const KEY = 'tally.private'

export const usePrivacy = create<{ hidden: boolean; set: (hidden: boolean) => void }>((set) => ({
  hidden: false,
  set: (hidden) => { set({ hidden }); AsyncStorage.setItem(KEY, hidden ? '1' : '0').catch(() => {}) },
}))

export async function loadPrivacy() {
  const v = await AsyncStorage.getItem(KEY).catch(() => null)
  if (v === '1') usePrivacy.setState({ hidden: true })
}

/** Inside, figures always show. */
export const Reveal = createContext(false)

/** Whether figures drawn here should be masked. */
export function useHidden() {
  const hidden = usePrivacy((s) => s.hidden)
  const reveal = useContext(Reveal)
  return hidden && !reveal
}

const MONEY = /\$\d[\d,]*(?:\.\d+)?[kM]?/g
/** "$1,234.56 more than −$12k" → "$••• more than −$•••". The sign stays, so money in still reads as money in. */
export const mask = (s: string) => s.replace(MONEY, '$•••')
