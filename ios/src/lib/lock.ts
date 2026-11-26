// Face ID to open Tally, the way banking apps do it: the saved server and token stay on the phone, and opening Tally
// shows the system's Face ID sheet before any figure is on screen. It asks on every cold start and on coming back
// after more than five minutes in the background; Control Center, the Face ID sheet itself, Plaid Link, the photo
// picker and share sheets only make Tally 'inactive' and never count. On by default when the phone has Face ID set
// up (Settings, FaceIdRow). Whether it's on or not, Tally is covered while it's in the app switcher.
//
// The prompt allows the iPhone passcode after failed scans (the module's default device fallback). The token is not
// stored behind Face ID in the keychain (SecureStore's requireAuthentication): after a biometric lockout, or with
// Face ID reset, that item can't be read at all and Tally would lose its login; a gate in front of the app can
// always fall back to the passcode.
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Auth from 'expo-local-authentication'
import { create } from 'zustand'

const KEY = 'tally.faceid'
/** Time in the background after which Tally asks again. */
export const AWAY_MS = 5 * 60_000
/** The web preview has no Face ID: the gate does nothing there. */
const native = process.env.EXPO_OS !== 'web'

/** The part of the lock that follows the app's state: pure, so the rules can be tested.
 *  `since`: when Tally went to the background ('inactive' alone never sets it). `tried`: Face ID was already asked for
 *  this lock, so the sheet closing (an 'active' event) doesn't ask again; the Unlock button does. */
export interface Gate { locked: boolean; tried: boolean; since: number | null }

export function onAppState(g: Gate, app: string, now: number, on: boolean): Gate {
  if (app === 'background') return g.since === null ? { ...g, since: now } : g
  if (app !== 'active' || g.since === null) return g // inactive, or back from a sheet or Control Center
  const locked = g.locked || (on && now - g.since > AWAY_MS)
  // Back from the background while locked: ask again, as the sheet was dismissed by leaving.
  return { locked, tried: locked ? false : g.tried, since: null }
}

/** Locked now, or about to be: a link can arrive before the 'active' event that locks after a long time away. */
export const lockDue = (g: Gate, now: number, on: boolean) => g.locked || (on && g.since !== null && now - g.since > AWAY_MS)

/** `available`: the phone has Face ID (or Touch ID) set up. `enabled`: the setting (effective only when available).
 *  `asking`: the system sheet is up. `opened`: unlocked once since launch, so the screens may mount.
 *  `cover`: the app-switcher cover. `held`: a tally:// link waiting for the unlock. */
interface Lock extends Gate {
  ready: boolean; available: boolean; enabled: boolean; asking: boolean; opened: boolean; cover: boolean; held: string | null
}
export const useLock = create<Lock>(() => ({
  ready: false, available: false, enabled: false, asking: false, opened: false, cover: false, held: null,
  locked: false, tried: false, since: null,
}))

const isOn = (s: Lock) => s.enabled && s.available

async function canUse(): Promise<boolean> {
  if (!native) return false
  try { return (await Auth.hasHardwareAsync()) && (await Auth.isEnrolledAsync()) } catch { return false }
}

/** Shows the system's Face ID sheet. True when it passed, or when the phone has no passcode left to ask for. */
async function check(): Promise<boolean> {
  try {
    const r = await Auth.authenticateAsync({ promptMessage: 'Unlock Tally' })
    return r.success || r.error === 'passcode_not_set'
  } catch {
    return false
  }
}

/** Asks for Face ID to unlock. Does nothing while the sheet is already up or Tally isn't locked. */
export async function unlock(): Promise<boolean> {
  const s = useLock.getState()
  if (!s.locked) return true
  if (s.asking) return false
  useLock.setState({ asking: true, tried: true })
  const ok = await check()
  useLock.setState(ok ? { asking: false, locked: false, tried: false, opened: true } : { asking: false })
  return ok
}

/** Asks for Face ID once a lock starts (launch, or back after a while), not again when its sheet closes. */
export function askIfDue() {
  const s = useLock.getState()
  if (s.locked && !s.tried && !s.asking && AppState.currentState === 'active') unlock().catch(() => {})
}

/** Applies an AppState change: the switcher cover, the time away and the lock. Exported for tests. */
export function appStateChanged(app: string, now = Date.now()) {
  const s = useLock.getState()
  const { locked, tried, since } = onAppState(s, app, now, isOn(s))
  // One update: a lock after a long time away takes over from the switcher cover with no frame of data between.
  useLock.setState({ locked, tried, since, cover: app !== 'active' })
  if (app === 'active' && locked && !tried) unlock().catch(() => {})
}

let watching = false

/** Reads the setting and whether the phone has Face ID, and starts locked if it's on. Runs before the splash lifts. */
export async function loadLock() {
  const [stored, available] = await Promise.all([AsyncStorage.getItem(KEY).catch(() => null), canUse()])
  const enabled = stored === null ? available : stored === '1' // on by default where Face ID is set up
  const locked = enabled && available
  useLock.setState({ ready: true, available, enabled, locked, tried: false, opened: !locked })
  if (!watching) {
    watching = true
    AppState.addEventListener('change', (app) => appStateChanged(app))
  }
}

/** Turning Face ID on asks for it first, so it's known to work (and iOS asks its permission then, not at launch). */
export async function setFaceId(on: boolean): Promise<boolean> {
  if (on && (!useLock.getState().available || !(await check()))) return false
  useLock.setState({ enabled: on })
  await AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {})
  return true
}

/** Locked or about to be, or the setting hasn't loaded yet: links wait (app/+native-intent.tsx). */
export function lockedNow(now = Date.now()): boolean {
  const s = useLock.getState()
  return !s.ready || lockDue(s, now, isOn(s))
}

/** Keeps a link for after unlocking. `path` is the link as it came in. A plain launch comes in as tally:/// and holds
 *  nothing: kept as "//", expo-router once opened it as https:// in Safari. */
export function holdLink(path: string) {
  const route = '/' + path.replace(/^[a-z][\w+.-]*:\/\//i, '').replace(/^\/+/, '') // tally://add?amount=1 → /add?amount=1
  if (route === '/' || route.startsWith('/?')) return
  useLock.setState({ held: route })
}
