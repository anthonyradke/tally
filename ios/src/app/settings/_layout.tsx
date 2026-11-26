// Settings is a sheet with its own stack. Every page in it has Done on the right, so the sheet closes from anywhere
// in it, even one opened straight from another screen (Accounts' Connected Banks), not only by swiping it down.
import { router, Stack } from 'expo-router'
import { Press } from '@/design/ui/Press'
import { Txt } from '@/design/ui/Txt'
import { usePalette } from '@/design/theme'

// Opening a page straight (/settings/banks from Accounts) still puts Settings under it, so Back leads somewhere.
export const unstable_settings = { initialRouteName: 'index' }

/** Close the whole sheet, whichever page of it is showing. Opened cold, with nothing under it, land on the tabs. */
export function closeSettings(nav: { getParent: () => { canGoBack: () => boolean; goBack: () => void } | undefined }) {
  const root = nav.getParent()
  if (root?.canGoBack()) root.goBack()
  else router.replace('/')
}

export default function SettingsStack() {
  const p = usePalette()
  return (
    <Stack screenOptions={({ navigation }) => ({
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
      // iOS draws these as native bar buttons (Done is the prominent glass one); headerRight is the web preview's.
      unstable_headerRightItems: () => [{ type: 'button', label: 'Done', variant: 'done', accessibilityLabel: 'Done', onPress: () => closeSettings(navigation) }],
      headerRight: () => (
        <Press feel="none" haptic={false} hitSlop={10} accessibilityLabel="Done" onPress={() => closeSettings(navigation)}>
          <Txt v="headline" color={p.tint}>Done</Txt>
        </Press>
      ),
    })}>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
      <Stack.Screen name="banks" options={{ title: 'Banks' }} />
      <Stack.Screen name="bank-account/[id]" options={{ title: '', headerLargeTitle: false }} />
      <Stack.Screen name="icon" options={{ title: 'App Icon' }} />
      <Stack.Screen name="outbox" options={{ title: 'Waiting to Send' }} />
      <Stack.Screen name="server" options={{ title: 'Server' }} />
    </Stack>
  )
}
