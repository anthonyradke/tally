// The notice store behind NoticeHost (ui/Notice.tsx): what's showing, and how an action's failure is worded. Apart
// from the view so actions can be tested without a renderer.
import { AccessibilityInfo } from 'react-native'
import type { SFSymbol } from 'expo-symbols'
import { create } from 'zustand'
import { ApiError } from '@/lib/api'
import { failure } from './haptics'
import type { Hue } from './theme'

export interface Note { id: number; text: string; symbol?: SFSymbol; hue?: Hue; action?: { label: string; run: () => unknown } }
export const useNotice = create<{ note: Note | null }>(() => ({ note: null }))
let seq = 0

export function notify(n: Omit<Note, 'id'>) {
  useNotice.setState({ note: { ...n, id: ++seq } })
  AccessibilityInfo?.announceForAccessibility?.(n.action ? `${n.text}. ${n.action.label} available.` : n.text)
}
export const clearNotice = (id: number) => { if (useNotice.getState().note?.id === id) useNotice.setState({ note: null }) }

/** Runs a notice's action (Undo); if it fails, says so with the reason instead of failing quietly. */
export async function runAction(n: Note) {
  if (!n.action) return
  try {
    await n.action.run()
  } catch (e) {
    failure()
    notify({ text: reasonOf(e, `Couldn't ${n.action.label.toLowerCase()}`), symbol: 'exclamationmark.triangle.fill', hue: 'orange' })
  }
}

/** Why an action failed, in words for a notice: the server's own reason when it refused (a 4xx other than "not
 *  found"), else `fallback`. */
export const reasonOf = (e: unknown, fallback: string) =>
  e instanceof ApiError && e.errors.length && e.status >= 400 && e.status < 500 && e.status !== 404 ? e.errors.join(' ') : fallback
