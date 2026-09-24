import { useEffect, useState } from 'react'
import { AppState, useColorScheme } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { Toaster } from '@/components/Toaster'
import { queryClient } from '@/lib/data'
import { flush, loadOutbox } from '@/lib/outbox'
import { loadServer } from '@/lib/server'
import { useTheme } from '@/theme'

SplashScreen.preventAutoHideAsync().catch(() => {})

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

function RootStack() {
  const { c } = useTheme()
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="entry" options={{ presentation: 'modal', headerShown: false, contentStyle: { backgroundColor: c.bg } }} />
      <Stack.Screen name="pick" options={{
        presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, headerShown: false,
        contentStyle: { backgroundColor: c.bg },
      }} />
      <Stack.Screen name="filters" options={{
        presentation: 'formSheet', sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true, headerShown: false,
        contentStyle: { backgroundColor: c.bg },
      }} />
      <Stack.Screen name="reconcile/[id]" options={{
        presentation: 'formSheet', sheetAllowedDetents: [1], sheetGrabberVisible: true, headerShown: false,
        contentStyle: { backgroundColor: c.bg },
      }} />
      <Stack.Screen name="edit" options={{ presentation: 'modal', headerShown: false, contentStyle: { backgroundColor: c.bg } }} />
    </Stack>
  )
}

export default function RootLayout() {
  const scheme = useColorScheme()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    Promise.all([loadServer(), loadOutbox()]).finally(() => setReady(true))
  }, [])
  if (!ready) return null
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider client={queryClient}
        persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 7, buster: 'v1' }}
        onSuccess={() => SplashScreen.hideAsync().catch(() => {})}>
        <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
          <RootStack />
          <OutboxSync />
          <Toaster />
        </ThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  )
}
