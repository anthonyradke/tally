// Lock with Face ID (Settings, off unless you turn it on): Tally asks for Face ID when it opens and when you come back
// after a minute away. Whether it's on or not, the app is blurred while it's in the app switcher.
// expo-local-authentication is loaded lazily, so a build made before it existed reports that it can't lock.
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'

type Auth = { hasHardwareAsync: () => Promise<boolean>; isEnrolledAsync: () => Promise<boolean>; authenticateAsync: (o: object) => Promise<{ success: boolean }> }
let auth: Auth | null = null
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { auth = process.env.EXPO_OS === 'web' ? null : (require('expo-local-authentication') as Auth) } catch { auth = null }

const KEY = 'tally.lock'
const AWAY_MS = 60_000

interface Lock { enabled: boolean; locked: boolean; cover: boolean }
export const useLock = create<Lock>(() => ({ enabled: false, locked: false, cover: false }))

export async function canLock(): Promise<boolean> {
  if (!auth) return false
  try { return (await auth.hasHardwareAsync()) && (await auth.isEnrolledAsync()) } catch { return false }
}

export async function unlock(): Promise<boolean> {
  if (!auth) { useLock.setState({ locked: false }); return true }
  try {
    const r = await auth.authenticateAsync({ promptMessage: 'Unlock Tally', fallbackLabel: 'Use passcode' })
    if (r.success) useLock.setState({ locked: false })
    return r.success
  } catch { return false }
}

/** Turning it on asks for Face ID first, so it can't lock you out of something that never worked. */
export async function setLockEnabled(on: boolean): Promise<boolean> {
  if (on) {
    if (!(await canLock()) || !(await unlock())) return false
  }
  useLock.setState({ enabled: on })
  await AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {})
  return true
}

let away = 0
export async function loadLock() {
  const on = (await AsyncStorage.getItem(KEY).catch(() => null)) === '1'
  useLock.setState({ enabled: on && !!auth, locked: on && !!auth })
  AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      const long = away && Date.now() - away > AWAY_MS
      away = 0
      useLock.setState((x) => ({ cover: false, locked: x.locked || (x.enabled && !!long) }))
    } else {
      if (!away) away = Date.now()
      useLock.setState({ cover: true })
    }
  })
}
