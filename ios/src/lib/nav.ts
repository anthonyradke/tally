import { useRef } from 'react'
import { router } from 'expo-router'

/** Dismiss a modal or sheet. Opened cold (a link, a restored session) there may be nothing under it, so land on Home. */
export function close() {
  if (router.canGoBack()) router.back()
  else router.replace('/')
}

/** The newest value of something, for a handler inside a header that's kept from one render to the next.
 *
 *  Keep a screen's `Stack.Screen` options and `Stack.Toolbar` in a `useMemo` keyed on what they show. A new element
 *  sets the screen's options again, and react-native-screens then drops every header button and makes new ones, so a
 *  tap that lands in between does nothing. Activity re-renders whenever its data refreshes and the composer on every
 *  key, which made the catch-up button and the X take a few tries. */
export function useLatest<T>(value: T) {
  const ref = useRef(value)
  ref.current = value // eslint-disable-line react-hooks/refs
  return ref
}
