// The app's frame: data kept on the phone, the outbox, the bank check-in, notices and the lock cover around three
// tabs and their sheets. A ledger with no accounts yet, on a server with bank sync, opens the welcome setup first.
// With Face ID on (lib/lock.ts), the screens mount only once Face ID has passed, so a cold start shows no saved figure
// before it; locked again later, they stay mounted (drafts and sheets kept) under the cover, hidden from VoiceOver,
// while the check-in, notices and links wait.
import { useEffect, useState } from 'react'
import { AppState, useColorScheme, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, useRootNavigationState } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { focusManager, useQuery } from '@tanstack/react-query'
import Constants from 'expo-constants'
import { BankCheckIn } from '@/components/BankCheckIn'
import { api, ApiError } from '@/lib/api'
import { keepOnPhone, queryClient } from '@/lib/data'
import { askIfDue, loadLock, useLock } from '@/lib/lock'
import { flush, loadOutbox } from '@/lib/outbox'
import { loadServer, useServer } from '@/lib/server'
import { loadLogoEpoch } from '@/design/actions'
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

function Screens({ locked }: { locked: boolean }) {
  const p = usePalette()
  const server = useServer((s) => s.url)
  const setup = useQuery({ queryKey: ['setup', server], queryFn: setupNeeded, staleTime: 60_000, retry: false })
  useEffect(() => {
    if (setup.data && !locked) router.push('/welcome')
  }, [setup.data, locked])
  const sheet = { contentStyle: { backgroundColor: p.bg } }
  return (
    <View style={{ flex: 1 }} accessibilityElementsHidden={locked} importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add" options={{ presentation: 'modal', ...sheet }} />
        <Stack.Screen name="check-in" options={{ presentation: 'modal', ...sheet }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal', ...sheet }} />
        <Stack.Screen name="welcome" options={{ presentation: 'fullScreenModal', gestureEnabled: false, ...sheet }} />
      </Stack>
    </View>
  )
}

/** Opens a tally:// link that came in while locked (app/+native-intent.tsx), once the screens are there. */
function HeldLink() {
  const held = useLock((s) => s.held)
  const navReady = !!useRootNavigationState()?.key
  useEffect(() => {
    if (!held || !navReady) return
    useLock.setState({ held: null })
    router.push(held as never)
  }, [held, navReady])
  return null
}

export default function RootLayout() {
  const scheme = useColorScheme()
  const p = usePalette()
  const nav = scheme === 'dark' ? DarkTheme : DefaultTheme
  const [ready, setReady] = useState(false)
  const locked = useLock((s) => s.locked)
  const opened = useLock((s) => s.opened)
  useEffect(() => {
    Promise.all([loadServer(), loadOutbox(), loadLogoEpoch(), loadLock().catch(() => useLock.setState({ ready: true, opened: true }))]).finally(() => {
      setReady(true)
      // Face ID comes up over the cover once the splash has gone, not over the splash.
      SplashScreen.hideAsync().catch(() => {}).finally(askIfDue)
    })
  }, [])
  if (!ready) return null
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider client={queryClient}
        persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 7, buster: Constants.expoConfig?.version ?? 'v1',
          dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.data !== undefined && keepOnPhone(q.queryKey) } }}>
        <ThemeProvider value={{ ...nav, colors: { ...nav.colors, primary: p.tint, background: p.bg, card: p.bg } }}>
          {opened && <Screens locked={locked} />}
          <OutboxSync />
          {!locked && opened && (
            <>
              <BankCheckIn />
              <NoticeHost />
              <HeldLink />
            </>
          )}
          <LockCover />
        </ThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  )
}
