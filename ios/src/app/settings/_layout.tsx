import { router, Stack } from 'expo-router'
import { usePalette } from '@/design/theme'

export default function SettingsStack() {
  const p = usePalette()
  return (
    <Stack screenOptions={{
      contentStyle: { backgroundColor: p.bg },
      headerLargeTitle: true,
      headerTransparent: process.env.EXPO_OS === 'ios',
      headerShadowVisible: false,
      headerLargeTitleShadowVisible: false,
      headerLargeStyle: { backgroundColor: 'transparent' },
      headerStyle: process.env.EXPO_OS === 'ios' ? undefined : { backgroundColor: p.bg },
      headerTintColor: p.tint,
      headerTitleStyle: { color: p.label },
      headerLargeTitleStyle: { color: p.label },
      headerBackButtonDisplayMode: 'minimal',
    }}>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="server" options={{ title: 'Server' }} />
      <Stack.Screen name="icon" options={{ title: 'App Icon' }} />
      <Stack.Screen name="banks" options={{ title: 'Banks' }} />
      <Stack.Screen name="outbox" options={{ title: 'Waiting to Send' }} />
    </Stack>
  )
}

export const closeSettings = () => router.back()
