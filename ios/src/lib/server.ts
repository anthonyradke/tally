// Where Tally's backend lives and the token it wants. There are two servers to choose from in Settings, Server: the
// real Tally and Tally Lab (bank sync tried out on a copy of the ledger, ~/notes/tally.md "Tally Lab"). Each keeps
// its own address and token, and everything the phone keeps for a server (the cache a cold start paints, the
// offline outbox, Catch up's marks) is stored under that server's own keys (`scoped`), so nothing from Lab can show
// in, or be sent to, the real Tally.
// The real address defaults to EXPO_PUBLIC_TALLY_URL (set in .env.local, never committed), Lab's to
// EXPO_PUBLIC_TALLY_LAB_URL, else the real one on port 8447. Tokens are typed once and kept in the keychain
// (SecureStore). Web builds served next to the API use '' (same origin, the preview adds the token).
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { create } from 'zustand'

export type Profile = 'tally' | 'lab'
export const PROFILES: Profile[] = ['tally', 'lab']
export const PROFILE_NAME: Record<Profile, string> = { tally: 'Tally', lab: 'Lab' }

const KEY = 'tally.server'
const TOKEN_KEY = 'tally.token'
const PROFILE_KEY = 'tally.profile'
const WEB = process.env.EXPO_OS === 'web'
const REAL = WEB ? '' : (process.env.EXPO_PUBLIC_TALLY_URL ?? '').replace(/\/+$/, '')
const LAB = WEB ? '' : (process.env.EXPO_PUBLIC_TALLY_LAB_URL ?? REAL.replace(/:8443$/, ':8447')).replace(/\/+$/, '')
const DEFAULTS: Record<Profile, string> = { tally: REAL, lab: LAB === REAL ? '' : LAB }

/** A key for something kept per server: the real Tally keeps the names it always had, Lab's get "@lab". */
export const keyFor = (base: string, p: Profile) => (p === 'tally' ? base : `${base}@${p}`)
/** SecureStore keys allow only letters, digits and . - _ */
const secureKey = (p: Profile) => (p === 'tally' ? TOKEN_KEY : `${TOKEN_KEY}.${p}`)

interface ServerState {
  profile: Profile
  url: string
  token: string
  set: (url: string) => void
  setToken: (token: string) => void
}

export const useServer = create<ServerState>((set, get) => ({
  profile: 'tally',
  url: DEFAULTS.tally,
  token: '',
  set: (url) => {
    const clean = cleanServer(url)
    set({ url: clean })
    AsyncStorage.setItem(keyFor(KEY, get().profile), clean).catch(() => {})
  },
  setToken: (token) => {
    const clean = token.trim()
    set({ token: clean })
    const k = secureKey(get().profile)
    if (!WEB) (clean ? SecureStore.setItemAsync(k, clean) : SecureStore.deleteItemAsync(k)).catch(() => {})
  },
}))

/** The key for something kept per server, for the server in use now. */
export const scoped = (base: string) => keyFor(base, useServer.getState().profile)

/** An address as typed, tidied: https:// added when there's no scheme, and no trailing slash or /api (requests add
 *  /api themselves, so "…:8443/api" went to /api/api/…). */
export function cleanServer(url: string): string {
  let u = url.trim().replace(/\/+$/, '').replace(/\/api$/i, '').replace(/\/+$/, '')
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`
  return u
}

export const getServer = () => useServer.getState().url
export const defaultServer = (p: Profile = useServer.getState().profile) => DEFAULTS[p]
export const isLab = () => useServer.getState().profile === 'lab'

/** The Authorization header for a request, or none before a token is saved. */
export const authHeaders = (): Record<string, string> => {
  const t = useServer.getState().token
  return t ? { Authorization: `Bearer ${t}` } : {}
}

async function read(p: Profile): Promise<{ url: string; token: string }> {
  if (WEB) return { url: DEFAULTS[p], token: '' }
  const [saved, token] = await Promise.all([
    AsyncStorage.getItem(keyFor(KEY, p)).catch(() => null),
    SecureStore.getItemAsync(secureKey(p)).catch(() => null),
  ])
  return { url: saved ?? DEFAULTS[p], token: token ?? '' }
}

/** Load the server in use, its address and its token before the first request. */
export async function loadServer() {
  if (WEB) return
  const saved = await AsyncStorage.getItem(PROFILE_KEY).catch(() => null)
  const profile: Profile = saved === 'lab' ? 'lab' : 'tally'
  useServer.setState({ profile, ...(await read(profile)) })
}

/** What another server is set to, without switching to it (Settings shows both). */
export const peekServer = read

/** Switches every request to the other server. The caller clears what the phone holds for the old one and reloads
 *  what it keeps for the new one (lib/profile.ts). */
export async function selectServer(p: Profile) {
  const next = await read(p)
  AsyncStorage.setItem(PROFILE_KEY, p).catch(() => {})
  useServer.setState({ profile: p, ...next })
}
