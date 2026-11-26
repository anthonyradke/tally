// Settings: which accounts show, the banks, entries waiting on the phone, the app icon and the connection to the
// server. Face ID unlocks Tally (FaceIdRow).
import { ScrollView } from 'react-native'
import { router } from 'expo-router'
import Constants from 'expo-constants'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { canChangeIcon, iconLabel, useAppIcon } from '@/lib/appIcon'
import { useBank } from '@/lib/bank'
import { useBootstrap } from '@/lib/data'
import { useOutbox } from '@/lib/outbox'
import { useServer } from '@/lib/server'
import { space, usePalette } from '@/design/theme'
import { Row, Section, Tile } from '@/design/ui/List'
import { FaceIdRow } from '@/design/ui/FaceIdRow'
import { Txt } from '@/design/ui/Txt'

/** Same question and cache as the frame's check on launch (app/_layout.tsx): does this ledger still need setup? */
async function setupNeeded(): Promise<boolean> {
  try {
    return (await api.setup.status()).needed
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return false
    throw e
  }
}

export default function Settings() {
  const p = usePalette()
  const bank = useBank()
  const server = useServer((s) => s.url)
  const setup = useQuery({ queryKey: ['setup', server], queryFn: setupNeeded, staleTime: 60_000, retry: false })
  const waiting = useOutbox((s) => s.items.length)
  const icon = useAppIcon((s) => s.name)
  const accounts = useBootstrap().data?.accounts ?? []
  const hidden = accounts.filter((a) => !a.active).length
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }} contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 60 }}>
      {setup.data && (
        <Section inset={62} footer="Tally hasn’t been set up from your banks yet.">
          <Row leading={<Tile symbol="building.columns.fill" color={p.tint} size={30} />} title="Finish Setup" chevron onPress={() => router.push('/welcome')} />
        </Section>
      )}
      {(accounts.length > 0 || bank.data || bank.isError) && (
        <Section inset={62}>
          {accounts.length > 0 && (
            <Row leading={<Tile symbol="creditcard.fill" color={p.blue} size={30} />} title="Accounts" value={hidden ? `${hidden} Hidden` : undefined} chevron
              onPress={() => router.push('/settings/accounts')} />
          )}
          {/* Kept while Tally can't be reached: the page says so and can try again. Gone only on a server without banks. */}
          {(bank.data || bank.isError) && (
            <Row leading={<Tile symbol="building.columns.fill" color={p.tint} size={30} />} title="Banks" value={bank.data ? String(bank.data.items.length) : undefined} chevron
              onPress={() => router.push('/settings/banks')} />
          )}
        </Section>
      )}
      <Section inset={62}>
        {waiting > 0 && (
          <Row leading={<Tile symbol="tray.and.arrow.up.fill" color={p.orange} size={30} />} title="Waiting to Send" value={String(waiting)} chevron
            onPress={() => router.push('/settings/outbox')} />
        )}
        {canChangeIcon && (
          <Row leading={<Tile symbol="app.fill" color={p.indigo} size={30} />} title="App Icon" value={iconLabel(icon)} chevron
            onPress={() => router.push('/settings/icon')} />
        )}
        <Row leading={<Tile symbol="server.rack" color={p.gray} size={30} />} title="Server" chevron
          onPress={() => router.push('/settings/server')} />
      </Section>
      <FaceIdRow />
      <Txt v="footnote" tone="label3" center>Tally {Constants.expoConfig?.version ?? ''}</Txt>
    </ScrollView>
  )
}
