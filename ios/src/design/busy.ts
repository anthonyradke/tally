// Guards for async buttons and sheets that close themselves after an await.
import { useCallback, useRef, useState } from 'react'
import { router, useNavigation } from 'expo-router'

/** Dismiss a sheet. Opened cold (tally://add, a restored session) there's nothing under it, so land on the tabs. */
export function close() {
  if (router.canGoBack()) router.back()
  else router.replace('/')
}

/** `close` for after an await: only while this screen is still the one in front. A sheet swiped down while it saved
 *  made a late `router.back()` pop the screen underneath as well. */
export function useCloseHere() {
  const nav = useNavigation()
  return useCallback(() => { if (nav.isFocused()) close() }, [nav])
}

/** A guard for async actions. `run` does nothing while the last one is still going (a ref, so a fast double tap
 *  can't get through between renders); `on` is for the spinner. */
export function useBusy() {
  const ref = useRef(false)
  const [on, setOn] = useState(false)
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (ref.current) return undefined
    ref.current = true
    setOn(true)
    try { return await fn() } finally { ref.current = false; setOn(false) }
  }, [])
  return { on, run }
}
