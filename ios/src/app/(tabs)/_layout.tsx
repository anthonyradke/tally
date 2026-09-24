import { DynamicColorIOS } from 'react-native'
import { NativeTabs } from 'expo-router/unstable-native-tabs'

// Tabs are peers: each keeps its own stack, and re-tapping the active tab pops to its root. The bar is the system's
// Liquid Glass bar; ink is the selected color, like every other interactive element.
const ink = process.env.EXPO_OS === 'ios' ? DynamicColorIOS({ light: '#000000', dark: '#FFFFFF' }) : undefined

export default function TabLayout() {
  return (
    <NativeTabs tintColor={ink} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(activity)">
        <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' }} md="receipt_long" />
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
