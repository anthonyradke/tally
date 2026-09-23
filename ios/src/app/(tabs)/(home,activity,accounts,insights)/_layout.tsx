import { Stack } from 'expo-router'
import { useTheme } from '@/theme'

// One stack per tab. Detail screens (an account, a category, Settings) are shared routes, so they push inside
// whichever tab you opened them from and back returns there.
export const unstable_settings = {
  anchor: 'index',
  activity: { anchor: 'activity' },
  accounts: { anchor: 'accounts' },
  insights: { anchor: 'insights' },
}

export default function TabStack() {
  const { c } = useTheme()
  return (
    <Stack screenOptions={{
      contentStyle: { backgroundColor: c.bg },
      headerLargeTitle: true,
      headerTransparent: process.env.EXPO_OS === 'ios',
      headerShadowVisible: false,
      headerLargeTitleShadowVisible: false,
      headerLargeStyle: { backgroundColor: 'transparent' },
      headerTintColor: c.ink,
      headerBackButtonDisplayMode: 'minimal',
    }}>
      <Stack.Screen name="index" options={{ title: 'Home' }} />
      <Stack.Screen name="activity" options={{ title: 'Activity' }} />
      <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
      <Stack.Screen name="insights" options={{ title: 'Insights' }} />
    </Stack>
  )
}
