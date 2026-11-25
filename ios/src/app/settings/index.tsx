// Settings: the banks, the app icon and the connection to the server. Face ID is iOS's own app lock.
import { ScrollView } from 'react-native'
import { router, Stack } from 'expo-router'
import Constants from 'expo-constants'
import { canChangeIcon, iconLabel, useAppIcon } from '@/lib/appIcon'
import { useBank } from '@/lib/bank'
import { space, usePalette } from '@/design/theme'
import { Row, Section, Tile } from '@/design/ui/List'
import { Txt } from '@/design/ui/Txt'

const HEADER = (
  <Stack.Toolbar placement="right">
    <Stack.Toolbar.Button variant="done" accessibilityLabel="Done" onPress={() => router.dismiss()}>Done</Stack.Toolbar.Button>
  </Stack.Toolbar>
)

export default function Settings() {
  const p = usePalette()
  const bank = useBank().data
  const icon = useAppIcon((s) => s.name)
  return (
    <>
      {HEADER}
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }} contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 60 }}>
        <Section inset={62} footer="To lock Tally with Face ID, touch and hold its icon on the Home Screen and choose Require Face ID.">
          {bank && (
            <Row leading={<Tile symbol="building.columns.fill" color={p.tint} size={30} />} title="Banks" value={String(bank.items.length)} chevron
              onPress={() => router.push('/settings/banks')} />
          )}
          {canChangeIcon && (
            <Row leading={<Tile symbol="app.fill" color={p.indigo} size={30} />} title="App Icon" value={iconLabel(icon)} chevron
              onPress={() => router.push('/settings/icon')} />
          )}
          <Row leading={<Tile symbol="server.rack" color={p.gray} size={30} />} title="Server" chevron
            onPress={() => router.push('/settings/server')} />
        </Section>
        <Txt v="footnote" tone="label3" center>Tally {Constants.expoConfig?.version ?? ''}</Txt>
      </ScrollView>
    </>
  )
}
