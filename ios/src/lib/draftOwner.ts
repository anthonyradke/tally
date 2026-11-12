// Keeps a screen's draft its own (see `owner` in lib/draft). When the screen loses focus to another that starts its
// own draft (the composer opened over the editor), it gets its draft back on returning; a picker sheet that only
// edits the draft doesn't take it over, so its changes stay.
import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { useDraft, type Draft } from './draft'

let n = 0

/** The token to pass to `reset`. */
export function useDraftOwner(): string {
  const [token] = useState(() => `d${++n}`)
  const saved = useRef<Draft | null>(null)
  useFocusEffect(useCallback(() => {
    const s = useDraft.getState()
    if (saved.current && s.owner !== token) useDraft.setState({ d: saved.current, owner: token })
    return () => {
      const now = useDraft.getState()
      if (now.owner === token) saved.current = now.d
    }
  }, [token]))
  return token
}
