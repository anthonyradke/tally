import { useEffect, useMemo, useState } from 'react'
import { AppState, useColorScheme } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { focusManager } from '@tanstack/react-query'
import Constants from 'expo-constants'
import { BankCheckIn } from '@/components/BankCheckIn'
import { Launch } from '@/components/Launch'
import { ThemeWash } from '@/components/ThemeWash'
import { Toaster } from '@/components/Toaster'
import { keepOnPhone, queryClient } from '@/lib/data'
import { flush, loadOutbox } from '@/lib/outbox'
import { loadPrivacy } from '@/lib/privacy'
import { keyFor, loadServer, useServer, type Profile } from '@/lib/server'
import { loadSounds } from '@/lib/sound'
import { loadLock } from '@/lib/lock'
import { loadCaughtUp } from '@/lib/caughtUp'
import { LockScreen } from '@/components/LockScreen'
import { loadTheme, useTheme } from '@/theme'

SplashScreen.preventAutoHideAsync().catch(() => {})

// Coming back to Tally counts as focus, so stale data (the bootstrap's "today" among it) refetches. React Query
// listens for the browser's visibilitychange by default, which React Native never fires: data stayed as it was until
// a screen mounted, and new entries were dated yesterday after a night in the background.
focusManager.setEventListener((handle) => {
  const sub = AppState.addEventListener('change', (s) => handle(s === 'active'))
  return () => sub.remove()
})

// Last good data is kept on the phone, so a cold start paints instantly (and offline) while fresh data loads. Each
// server (Tally, Tally Lab) has its own copy.
const persisterFor = (p: Profile) => createAsyncStoragePersister({ storage: AsyncStorage, key: keyFor('tally.cache', p), throttleTime: 1500 })

/** Posts queued offline entries on launch, on foregrounding and every 20 s while open (not the ones Tally refused:
 *  those wait for Send now in Settings). */
function OutboxSync() {
  useEffect(() => {
    flush().catch(() => {})
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') flush().catch(() => {}) })
    const id = setInterval(() => { if (AppState.currentState === 'active') flush().catch(() => {}) }, 20_000)
    return () => { sub.remove(); clearInterval(id) }
  }, [])
  return null
}

function RootStack() {
  const { c } = useTheme()
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* The composer and editor show a header; it's on from the start, since switching it on from inside a modal
          remounts the screen (and threw away the keypad's animation state). */}
      <Stack.Screen name="entry" options={{ presentation: 'modal', headerShown: true, headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, contentStyle: { backgroundColor: c.bg } }} />
      <Stack.Screen name="new" options={{ presentation: 'modal', headerShown: true, headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, contentStyle: { backgroundColor: c.bg } }} />
      <Stack.Screen name="catchup" options={{ presentation: 'modal', headerShown: true, headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, contentStyle: { backgroundColor: c.bg } }} />
      <Stack.Screen name="pick" options={{
        presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, headerShown: false,
        contentStyle: { backgroundColor: c.bg },
      }} />
      <Stack.Screen name="filters" options={{
        presentation: 'formSheet', sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true, headerShown: false,
        contentStyle: { backgroundColor: c.bg },
      }} />
      {/* A modal, not a form sheet: inside a form sheet the rolling amount never moved as you typed. */}
      <Stack.Screen name="reconcile/[id]" options={{ presentation: 'modal', headerShown: false, contentStyle: { backgroundColor: c.bg } }} />
      <Stack.Screen name="story" options={{ presentation: 'fullScreenModal', headerShown: false, contentStyle: { backgroundColor: '#000000' } }} />
      {/* Bank sync (Tally Lab): the inbox, what opening Tally brings up, one row's sheet, and an account checked
          against its bank. */}
      <Stack.Screen name="bank" options={{ presentation: 'modal', headerShown: true, headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, contentStyle: { backgroundColor: c.bg } }} />
      <Stack.Screen name="bank-new" options={{ presentation: 'modal', headerShown: true, headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, contentStyle: { backgroundColor: c.bg } }} />
      <Stack.Screen name="bank-item" options={{
        presentation: 'formSheet', sheetAllowedDetents: [0.85, 1], sheetGrabberVisible: true, headerShown: false,
        contentStyle: { backgroundColor: c.bg },
      }} />
      <Stack.Screen name="bank-audit" options={{ presentation: 'modal', headerShown: true, headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, contentStyle: { backgroundColor: c.bg } }} />
      <Stack.Screen name="edit" options={{ presentation: 'modal', headerShown: true, headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, contentStyle: { backgroundColor: c.bg } }} />
    </Stack>
  )
}

export default function RootLayout() {
  const scheme = useColorScheme()
  const { c } = useTheme()
  const nav = scheme === 'dark' ? DarkTheme : DefaultTheme
  const [ready, setReady] = useState(false)
  const [launching, setLaunching] = useState(true)
  const profile = useServer((s) => s.profile)
  const persister = useMemo(() => persisterFor(profile), [profile])
  useEffect(() => {
    Promise.all([loadServer(), loadOutbox(), loadTheme(), loadPrivacy(), loadSounds(), loadLock(), loadCaughtUp()]).finally(() => setReady(true))
  }, [])
  if (!ready) return null
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Keyed by server: switching between Tally and Lab remounts everything on the new server's own cache. */}
      <PersistQueryClientProvider key={profile} client={queryClient}
        persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 7, buster: Constants.expoConfig?.version ?? 'v1',
          dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && keepOnPhone(q.queryKey) } }}>
        <ThemeProvider value={{ ...nav, colors: { ...nav.colors, primary: c.ink, background: c.bg, card: c.bg } }}>
          <RootStack />
          <OutboxSync />
          <BankCheckIn />
          <Toaster />
          <ThemeWash />
          <LockScreen />
        </ThemeProvider>
      </PersistQueryClientProvider>
      {/* Takes over from the native splash (it hides it), then lifts off the app underneath. */}
      {launching && <Launch onDone={() => setLaunching(false)} />}
    </GestureHandlerRootView>
  )
}
