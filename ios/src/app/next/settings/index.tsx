// Settings: which design, which Tally, the banks, and Face ID. Everything else is still in Classic for now.
import { useEffect, useState } from 'react'
import { ScrollView, Switch } from 'react-native'
import { router, Stack } from 'expo-router'
import Constants from 'expo-constants'
import { useBank } from '@/lib/bank'
import { canLock, setLockEnabled, useLock } from '@/lib/lock'
import { useServer } from '@/lib/server'
import { setDesign } from '@/next/design'
import { tick } from '@/next/haptics'
import { space, usePalette } from '@/next/theme'
import { Row, Section, Tile } from '@/next/ui/List'
import { Txt } from '@/next/ui/Txt'

const HEADER = (
  <Stack.Toolbar placement="right">
    <Stack.Toolbar.Button variant="done" accessibilityLabel="Done" onPress={() => router.dismiss()}>Done</Stack.Toolbar.Button>
  </Stack.Toolbar>
)

export default function Settings() {
  const p = usePalette()
  const bank = useBank().data
  const profile = useServer((s) => s.profile)
  const lockOn = useLock((s) => s.enabled)
  const [lockable, setLockable] = useState(false)
  useEffect(() => { canLock().then(setLockable).catch(() => {}) }, [])
  return (
    <>
      {HEADER}
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }} contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 60 }}>
        <Section footer="Turn this off to go back to the original Tally design. Your data is the same in both." inset={62}>
          <Row leading={<Tile symbol="sparkles" color={p.purple} size={30} />} title="New Design"
            trailing={<Switch value onValueChange={(on) => { if (!on) { tick(); setDesign('classic') } }} />} />
        </Section>
        <Section inset={62}>
          <Row leading={<Tile symbol="server.rack" color={p.gray} size={30} />} title="Server" value={profile === 'lab' ? 'Tally Lab' : 'Tally'} chevron
            onPress={() => router.push('/next/settings/server')} />
          {bank && (
            <Row leading={<Tile symbol="building.columns.fill" color={p.blue} size={30} />} title="Banks" value={String(bank.items.length)} chevron
              onPress={() => router.push('/next/settings/banks')} />
          )}
          {lockable && (
            <Row leading={<Tile symbol="faceid" color={p.green} size={30} />} title="Face ID"
              trailing={<Switch value={lockOn} onValueChange={(on) => { tick(); setLockEnabled(on).catch(() => {}) }} />} />
          )}
        </Section>
        <Txt v="footnote" tone="label3" center>Tally {Constants.expoConfig?.version ?? ''}</Txt>
      </ScrollView>
    </>
  )
}
