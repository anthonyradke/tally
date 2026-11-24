// The New design (src/next): its own screens over the same data as Classic. Shown when Settings has New on; a
// ledger with no accounts yet on a server with bank sync opens the welcome setup first.
import { useEffect } from 'react'
import { Redirect, router, Stack } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { useServer } from '@/lib/server'
import { useDesign } from '@/next/design'
import { usePalette } from '@/next/theme'
import { NoticeHost } from '@/next/ui/Notice'

async function setupNeeded(): Promise<boolean> {
  try {
    return (await api.setup.status()).needed
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return false // no bank sync on this server
    throw e
  }
}

export default function NextLayout() {
  const design = useDesign((s) => s.design)
  const p = usePalette()
  const server = useServer((s) => s.url)
  const setup = useQuery({ queryKey: ['setup', server], queryFn: setupNeeded, staleTime: 60_000, retry: false })
  useEffect(() => {
    if (setup.data) router.push('/next/welcome')
  }, [setup.data])
  if (design !== 'new') return <Redirect href="/" />
  const sheet = { contentStyle: { backgroundColor: p.bg } }
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add" options={{ presentation: 'modal', ...sheet }} />
        <Stack.Screen name="check-in" options={{ presentation: 'modal', ...sheet }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal', ...sheet }} />
        <Stack.Screen name="welcome" options={{ presentation: 'fullScreenModal', gestureEnabled: false, ...sheet }} />
      </Stack>
      <NoticeHost />
    </>
  )
}
