// Sound effects: short, quiet sounds under the haptics (drawn by scripts/sounds.mjs). They follow the ring/silent
// switch, mix with whatever else is playing, and can be switched off in Settings (a setting on this phone).
// expo-audio is loaded lazily: a build made before it was added (or the web preview without a player) just stays
// silent instead of crashing.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'

export type Sound = 'key' | 'tick' | 'add' | 'income' | 'remove' | 'undo' | 'success' | 'error' | 'toggle' | 'swoosh'

const FILES: Record<Sound, number> = {
  key: require('../../assets/sounds/key.wav'),
  tick: require('../../assets/sounds/tick.wav'),
  add: require('../../assets/sounds/add.wav'),
  income: require('../../assets/sounds/income.wav'),
  remove: require('../../assets/sounds/remove.wav'),
  undo: require('../../assets/sounds/undo.wav'),
  success: require('../../assets/sounds/success.wav'),
  error: require('../../assets/sounds/error.wav'),
  toggle: require('../../assets/sounds/toggle.wav'),
  swoosh: require('../../assets/sounds/swoosh.wav'),
}

type Player = { play: () => void; seekTo: (s: number) => Promise<void>; volume: number }
type Audio = { createAudioPlayer: (src: number) => Player; setAudioModeAsync: (m: object) => Promise<void> }
let audio: Audio | null = null
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { audio = process.env.EXPO_OS === 'web' ? null : (require('expo-audio') as Audio) } catch { audio = null }

const KEY = 'tally.sounds'
export const useSounds = create<{ on: boolean; set: (on: boolean) => void }>((set) => ({
  on: true,
  set: (on) => { set({ on }); AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {}) },
}))

const players = new Map<Sound, Player>()
let ready = false

export async function loadSounds() {
  const v = await AsyncStorage.getItem(KEY).catch(() => null)
  if (v === '0') useSounds.setState({ on: false })
  if (!audio) return
  try {
    // Silent switch on = no sounds; music or a podcast keeps playing underneath.
    await audio.setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false })
    for (const s of Object.keys(FILES) as Sound[]) players.set(s, audio.createAudioPlayer(FILES[s])) // loaded up front: no lag on the first one
    ready = true
  } catch { ready = false }
}

/** Play one. A sound that's still ringing restarts, so fast keypad taps each get their click. */
export function play(s: Sound, volume = 1) {
  if (!audio || !ready || !useSounds.getState().on) return
  try {
    let p = players.get(s)
    if (!p) { p = audio.createAudioPlayer(FILES[s]); players.set(s, p) }
    p.volume = volume
    const go = p
    go.seekTo(0).catch(() => {}).finally(() => go.play())
  } catch { /* a sound never gets in the way */ }
}
