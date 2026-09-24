// Where Tally's backend lives. Defaults to EXPO_PUBLIC_TALLY_URL (set in .env.local, never committed); the user can
// change it in Settings. Web builds served next to the API use '' (same origin).
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'

const KEY = 'tally.server'
const DEFAULT = process.env.EXPO_OS === 'web' ? '' : (process.env.EXPO_PUBLIC_TALLY_URL ?? '').replace(/\/+$/, '')

interface ServerState { url: string; set: (url: string) => void }

export const useServer = create<ServerState>((set) => ({
  url: DEFAULT,
  set: (url) => {
    const clean = url.trim().replace(/\/+$/, '')
    set({ url: clean })
    AsyncStorage.setItem(KEY, clean).catch(() => {})
  },
}))

export const getServer = () => useServer.getState().url
export const defaultServer = DEFAULT

/** Load a saved override before the first request. */
export async function loadServer() {
  const saved = await AsyncStorage.getItem(KEY).catch(() => null)
  if (saved && process.env.EXPO_OS !== 'web') useServer.setState({ url: saved })
}
