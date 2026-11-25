// One stack per tab with large titles that collapse into the glass bar as you scroll. An entry or an account opens
// inside the tab you're in.
import { Stack, useRoute } from 'expo-router'
import { usePalette } from '@/design/theme'

export const unstable_settings = {
  anchor: 'index',
  activity: { anchor: 'activity' },
  accounts: { anchor: 'accounts' },
}

export default function NextTabStack() {
  const p = usePalette()
  const group = useRoute().name.replace(/^\(|\)$/g, '') as keyof typeof unstable_settings
  const settings = unstable_settings[group]
  const anchor = typeof settings === 'object' ? settings.anchor : unstable_settings.anchor
  return (
    <Stack initialRouteName={anchor} screenOptions={{
      contentStyle: { backgroundColor: p.bg },
      headerLargeTitle: true,
      headerTransparent: process.env.EXPO_OS === 'ios',
      headerShadowVisible: false,
      headerLargeTitleShadowVisible: false,
      headerLargeStyle: { backgroundColor: 'transparent' },
      headerStyle: process.env.EXPO_OS === 'ios' ? undefined : { backgroundColor: p.bg },
      headerTintColor: p.blue,
      headerTitleStyle: { color: p.label },
      headerLargeTitleStyle: { color: p.label },
      headerBackButtonDisplayMode: 'minimal',
    }}>
      <Stack.Screen name="index" options={{ title: 'Summary' }} />
      <Stack.Screen name="activity" options={{ title: 'Activity' }} />
      <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
      <Stack.Screen name="txn/[id]" options={{ title: '', headerLargeTitle: false }} />
      <Stack.Screen name="account/[id]" options={{ title: '', headerLargeTitle: false }} />
    </Stack>
  )
}
