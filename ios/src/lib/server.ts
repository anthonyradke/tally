// Where Tally's backend lives and the token it wants. The address defaults to EXPO_PUBLIC_TALLY_URL (set in
// .env.local, never committed); the user can change it in Settings. The token is typed once in Settings and kept in
// the keychain (SecureStore). Web builds served next to the API use '' (same origin, the preview adds the token).
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { create } from 'zustand'

const KEY = 'tally.server'
const TOKEN_KEY = 'tally.token'
const WEB = process.env.EXPO_OS === 'web'
const DEFAULT = WEB ? '' : (process.env.EXPO_PUBLIC_TALLY_URL ?? '').replace(/\/+$/, '')

interface ServerState {
  url: string
  token: string
  set: (url: string) => void
  setToken: (token: string) => void
}

export const useServer = create<ServerState>((set) => ({
  url: DEFAULT,
  token: '',
  set: (url) => {
    const clean = url.trim().replace(/\/+$/, '')
    set({ url: clean })
    AsyncStorage.setItem(KEY, clean).catch(() => {})
  },
  setToken: (token) => {
    const clean = token.trim()
    set({ token: clean })
    if (!WEB) (clean ? SecureStore.setItemAsync(TOKEN_KEY, clean) : SecureStore.deleteItemAsync(TOKEN_KEY)).catch(() => {})
  },
}))

export const getServer = () => useServer.getState().url
export const defaultServer = DEFAULT

/** The Authorization header for a request, or none before a token is saved. */
export const authHeaders = (): Record<string, string> => {
  const t = useServer.getState().token
  return t ? { Authorization: `Bearer ${t}` } : {}
}

/** Load a saved override and the token before the first request. */
export async function loadServer() {
  if (WEB) return
  const [saved, token] = await Promise.all([
    AsyncStorage.getItem(KEY).catch(() => null),
    SecureStore.getItemAsync(TOKEN_KEY).catch(() => null),
  ])
  useServer.setState({ ...(saved ? { url: saved } : {}), ...(token ? { token } : {}) })
}
