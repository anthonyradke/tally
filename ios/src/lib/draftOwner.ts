// Keeps a screen's draft its own (see `owner` in lib/draft). When another screen opened over it starts its own draft
// (the editor opened from Catch up's "N added", the composer over the editor), it gets its draft back on returning; a
// picker sheet that only edits the draft doesn't take it over, so its changes stay.
import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect, useRoute } from 'expo-router'
import { useDraft, type Draft } from './draft'

let n = 0
/** Each screen's (route key's) last owner: the composer and the Catch up embedded in it share one screen, and only
 *  the one that had the draft last takes it back. */
const lastOf = new Map<string, string>()
/** The mounted keepers by token, for `renew`. */
const keepers = new Map<string, { stash: (d: Draft) => void }>()

/** What a screen keeps of the draft. It notes the draft on every change while it owns it, not as the screen loses
 *  focus: the screen opened over it seeds its own draft as it mounts, before the one underneath hears it's blurred,
 *  so a draft read on blur was already the new screen's, and nothing was given back. */
export function keeper(token: string, screen: string) {
  let saved: Draft | null = null
  const note = (s: { d: Draft; owner: string | null }) => {
    if (s.owner !== token) return
    saved = s.d
    lastOf.set(screen, token)
  }
  const stash = (d: Draft) => { saved = d; lastOf.set(screen, token) }
  return {
    token,
    /** Follows the store while the screen is mounted; returns the cleanup. */
    watch: () => {
      keepers.set(token, { stash })
      note(useDraft.getState())
      const unsub = useDraft.subscribe(note)
      return () => { unsub(); keepers.delete(token); if (lastOf.get(screen) === token) lastOf.delete(screen) }
    },
    /** The screen is back on top: its draft comes back if another took the store meanwhile. */
    focus: () => {
      const s = useDraft.getState()
      if (s.owner === token) note(s)
      else if (saved && lastOf.get(screen) === token) useDraft.setState({ d: saved, owner: token })
    },
  }
}

/** Starts a screen's next draft after an await (Catch up's next line once an Add lands): in the store while the screen
 *  still has it, else kept for when it's back on top, so a screen opened over it meanwhile (the editor, from "N
 *  added") keeps its own draft. */
export function renew(d: Draft, token: string) {
  const s = useDraft.getState()
  if (s.owner === token) s.reset(d, token)
  else keepers.get(token)?.stash(d)
}

/** The token to pass to `reset`. */
export function useDraftOwner(): string {
  const screen = useRoute().key
  const [k] = useState(() => keeper(`d${++n}`, screen))
  useEffect(() => k.watch(), [k])
  useFocusEffect(useCallback(() => k.focus(), [k]))
  return k.token
}
