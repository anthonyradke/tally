import { router } from 'expo-router'

/** Dismiss a modal or sheet. Opened cold (a link, a restored session) there may be nothing under it, so land on Home. */
export function close() {
  if (router.canGoBack()) router.back()
  else router.replace('/')
}
