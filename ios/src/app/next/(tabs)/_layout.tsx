// The New design's tab bar: the system's Liquid Glass bar with three tabs. Adding is a + in each screen's toolbar,
// where iOS puts it.
import { DynamicColorIOS } from 'react-native'
import { NativeTabs } from 'expo-router/unstable-native-tabs'

const blue = process.env.EXPO_OS === 'ios' ? DynamicColorIOS({ light: '#007AFF', dark: '#0A84FF' }) : '#007AFF'

export default function NextTabs() {
  return (
    <NativeTabs tintColor={blue} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Label>Summary</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} md="dashboard" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(activity)">
        <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'list.bullet', selected: 'list.bullet' }} md="receipt_long" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(accounts)">
        <NativeTabs.Trigger.Label>Accounts</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'building.columns', selected: 'building.columns.fill' }} md="account_balance" />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
