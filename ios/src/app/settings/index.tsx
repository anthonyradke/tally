// Settings: the banks, Face ID, the app icon and the connection to the server.
import { useEffect, useState } from 'react'
import { ScrollView, Switch } from 'react-native'
import { router, Stack } from 'expo-router'
import Constants from 'expo-constants'
import { canChangeIcon, iconLabel, useAppIcon } from '@/lib/appIcon'
import { useBank } from '@/lib/bank'
import { canLock, setLockEnabled, useLock } from '@/lib/lock'
import { tick } from '@/design/haptics'
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
  const lockOn = useLock((s) => s.enabled)
  const icon = useAppIcon((s) => s.name)
  const [lockable, setLockable] = useState(false)
  useEffect(() => { canLock().then(setLockable).catch(() => {}) }, [])
  return (
    <>
      {HEADER}
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }} contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 60 }}>
        <Section inset={62}>
          {bank && (
            <Row leading={<Tile symbol="building.columns.fill" color={p.blue} size={30} />} title="Banks" value={String(bank.items.length)} chevron
              onPress={() => router.push('/settings/banks')} />
          )}
          {lockable && (
            <Row leading={<Tile symbol="faceid" color={p.green} size={30} />} title="Face ID"
              trailing={<Switch value={lockOn} onValueChange={(on) => { tick(); setLockEnabled(on).catch(() => {}) }} />} />
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
