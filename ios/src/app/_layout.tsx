// The app's frame: data kept on the phone, the outbox, the bank check-in, notices and the lock cover around three
// tabs and their sheets. A ledger with no accounts yet, on a server with bank sync, opens the welcome setup first.
import { useEffect, useState } from 'react'
import { AppState, useColorScheme } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { focusManager, useQuery } from '@tanstack/react-query'
import Constants from 'expo-constants'
import { BankCheckIn } from '@/components/BankCheckIn'
import { api, ApiError } from '@/lib/api'
import { keepOnPhone, queryClient } from '@/lib/data'
import { loadLock } from '@/lib/lock'
import { flush, loadOutbox } from '@/lib/outbox'
import { loadServer, useServer } from '@/lib/server'
import { usePalette } from '@/design/theme'
import { LockCover } from '@/design/ui/LockCover'
import { NoticeHost } from '@/design/ui/Notice'

SplashScreen.preventAutoHideAsync().catch(() => {})

// Coming back to Tally counts as focus, so stale data (the bootstrap's "today" among it) refetches. React Query
// listens for the browser's visibilitychange by default, which React Native never fires.
focusManager.setEventListener((handle) => {
  const sub = AppState.addEventListener('change', (s) => handle(s === 'active'))
  return () => sub.remove()
})

// Last good data is kept on the phone, so a cold start paints instantly (and offline) while fresh data loads.
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'tally.cache', throttleTime: 1500 })

/** Posts queued offline entries on launch, on foregrounding and every 20 s while open. */
function OutboxSync() {
  useEffect(() => {
    flush().catch(() => {})
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') flush().catch(() => {}) })
    const id = setInterval(() => { if (AppState.currentState === 'active') flush().catch(() => {}) }, 20_000)
    return () => { sub.remove(); clearInterval(id) }
  }, [])
  return null
}

async function setupNeeded(): Promise<boolean> {
  try {
    return (await api.setup.status()).needed
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return false // no bank sync on this server
    throw e
  }
}

function Screens() {
  const p = usePalette()
  const server = useServer((s) => s.url)
  const setup = useQuery({ queryKey: ['setup', server], queryFn: setupNeeded, staleTime: 60_000, retry: false })
  useEffect(() => {
    if (setup.data) router.push('/welcome')
  }, [setup.data])
  const sheet = { contentStyle: { backgroundColor: p.bg } }
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add" options={{ presentation: 'modal', ...sheet }} />
      <Stack.Screen name="check-in" options={{ presentation: 'modal', ...sheet }} />
      <Stack.Screen name="settings" options={{ presentation: 'modal', ...sheet }} />
      <Stack.Screen name="welcome" options={{ presentation: 'fullScreenModal', gestureEnabled: false, ...sheet }} />
    </Stack>
  )
}

export default function RootLayout() {
  const scheme = useColorScheme()
  const p = usePalette()
  const nav = scheme === 'dark' ? DarkTheme : DefaultTheme
  const [ready, setReady] = useState(false)
  useEffect(() => {
    Promise.all([loadServer(), loadOutbox(), loadLock()]).finally(() => {
      setReady(true)
      SplashScreen.hideAsync().catch(() => {})
    })
  }, [])
  if (!ready) return null
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider client={queryClient}
        persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 7, buster: Constants.expoConfig?.version ?? 'v1',
          dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && keepOnPhone(q.queryKey) } }}>
        <ThemeProvider value={{ ...nav, colors: { ...nav.colors, primary: p.tint, background: p.bg, card: p.bg } }}>
          <Screens />
          <OutboxSync />
          <BankCheckIn />
          <NoticeHost />
          <LockCover />
        </ThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  )
}
