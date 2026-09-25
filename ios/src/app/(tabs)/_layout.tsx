import { DynamicColorIOS, useColorScheme } from 'react-native'
import { router } from 'expo-router'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import * as Haptics from 'expo-haptics'
import { themeById, useThemeChoice } from '@/theme'
import { ADD_ICON } from '@/theme/tab-icons'

// Tabs are peers: each keeps its own stack, and re-tapping the active tab pops to its root. The bar is the system's
// Liquid Glass bar at full size all the time; the theme's accent is the selected color, like every other interactive
// element. The + in the middle opens the composer from anywhere.
export default function TabLayout() {
  const id = useThemeChoice((s) => s.id)
  const spec = themeById(id)
  const dark = useColorScheme() === 'dark'
  const ink = process.env.EXPO_OS === 'ios' ? DynamicColorIOS({ light: spec.light.ink, dark: spec.dark.ink }) : spec.light.ink
  const add = ADD_ICON[spec.id] ?? ADD_ICON.classic
  return (
    <NativeTabs tintColor={ink} minimizeBehavior="never">
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(activity)">
        <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' }} md="receipt_long" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="add" disabled accessibilityLabel="Add an entry"
        listeners={{ tabPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); router.push('/add') } }}>
        <NativeTabs.Trigger.Label>Add</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={dark ? add.dark : add.light} renderingMode="original" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(accounts)">
        <NativeTabs.Trigger.Label>Accounts</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'building.columns', selected: 'building.columns.fill' }} md="account_balance" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(insights)">
        <NativeTabs.Trigger.Label>Insights</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'chart.pie', selected: 'chart.pie.fill' }} md="pie_chart" />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
