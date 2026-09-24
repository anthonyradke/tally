import { Stack, useRoute } from 'expo-router'
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
  // Listing the screens below fixes their order, and then the Stack starts on the first one (Home) in every tab
  // unless it's told otherwise, so pass this tab's anchor explicitly. The route here is the tab, e.g. '(activity)'.
  const group = useRoute().name.replace(/^\(|\)$/g, '') as keyof typeof unstable_settings
  const settings = unstable_settings[group]
  const anchor = typeof settings === 'object' ? settings.anchor : unstable_settings.anchor
  return (
    <Stack initialRouteName={anchor} screenOptions={{
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
