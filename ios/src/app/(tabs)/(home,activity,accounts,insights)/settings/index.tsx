import { useState } from 'react'
import { ScrollView, Switch, View } from 'react-native'
import { Stack } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Constants from 'expo-constants'
import { Icon } from '@/components/Icon'
import { Group, Row } from '@/components/Row'
import { Txt } from '@/components/Txt'
import { api } from '@/lib/api'
import { iconLabel, useAppIcon } from '@/lib/appIcon'
import { useOutbox } from '@/lib/outbox'
import { usePrivacy } from '@/lib/privacy'
import { play, useSounds } from '@/lib/sound'
import { setLockEnabled, useLock } from '@/lib/lock'
import { toast } from '@/lib/toast'
import { useServer } from '@/lib/server'
import { useTally } from '@/lib/tally'
import { space, themeById, useTheme } from '@/theme'

const ago = (iso: string, now: number) => {
  const h = (now - new Date(iso).getTime()) / 36e5
  return h < 1 ? 'Under an hour ago' : h < 48 ? `${Math.round(h)} hours ago` : `${Math.round(h / 24)} days ago`
}

export default function Settings() {
  const { c, theme } = useTheme()
  const { b } = useTally()
  const url = useServer((s) => s.url)
  const queued = useOutbox((s) => s.items)
  const icon = useAppIcon((s) => s.name)
  const hidden = usePrivacy((s) => s.hidden)
  const sounds = useSounds((s) => s.on)
  const locking = useLock((s) => s.enabled)
  const backups = useQuery({ queryKey: ['backups'], queryFn: api.backups })
  const last = backups.data?.latest
  const [now] = useState(() => Date.now())
  const stale = last ? now - new Date(last.at).getTime() > 36 * 36e5 : false
  const budgets = b ? b.categories.filter((x) => x.budget).length : 0
  return (
    <>
      <Stack.Screen options={{ title: 'Settings' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 80 }}>
        <Group header="Everyday">
          <Row label="Quick actions" value={b ? String(b.favorites.length) : ''} sf="bolt" md="bolt" href="/settings/quick" />
          <Row label="Recurring" value={b ? String(b.recurring.length) : ''} sf="repeat" md="repeat" href="/settings/recurring" />
          <Row label="Saved views" value={b ? String(b.saved_views.length) : ''} sf="bookmark" md="bookmark" href="/settings/views" />
          <Row label="Add from Wallet" sub="A Shortcuts automation that opens Tally after you tap to pay" sf="wallet.pass" md="wallet" href="/settings/capture" />
        </Group>
        <Group header="Money">
          <Row label="Accounts" value={b ? String(b.accounts.filter((a) => a.active).length) : ''} sf="building.columns" md="account_balance" href="/settings/accounts" />
          <Row label="Categories" value={b ? String(b.categories.filter((x) => x.active).length) : ''} sf="square.grid.2x2" md="category" href="/settings/categories" />
          <Row label="Budgets" value={budgets ? `${budgets} set` : 'None'} sf="gauge.with.needle" md="speed" href="/settings/budgets" />
          <Row label="Goals" sub="Emergency fund, Roth IRA, interest" sf="target" md="flag" href="/settings/general" />
        </Group>
        <Group header="App">
          <Row label="Theme" value={themeById(theme).name} sf="paintpalette" md="palette" href="/settings/theme" />
          <Row label="App icon" value={iconLabel(icon)} sf="app.badge" md="apps" href="/settings/icon" />
          <Row label="Home screen" sub="Choose and order what Home shows" sf="square.stack" md="dashboard" href="/settings/home" />
          <Row label="Hide amounts" sub="Every figure reads $••• until you switch it off. The eye on Home does the same." sf="eye.slash" md="visibility_off" chevron={false}
            trailing={<Switch value={hidden} onValueChange={(v) => usePrivacy.getState().set(v)} />} />
          <Row label="Sounds" sub="Soft clicks and chimes under the haptics. The silent switch mutes them." sf="speaker.wave.2" md="volume_up" chevron={false}
            trailing={<Switch value={sounds} onValueChange={(v) => { useSounds.getState().set(v); if (v) play('toggle') }} />} />
          <Row label="Lock with Face ID" sub="Asks when Tally opens, and when you come back after a minute away." sf="faceid" md="lock" chevron={false}
            trailing={<Switch value={locking} onValueChange={(v) => setLockEnabled(v).then((ok) => { if (!ok) toast({ text: "Face ID isn't available, or it didn't match. Tally stays unlocked.", tone: 'error' }) })} />} />
          <Row label="Server" value={url ? url.replace(/^https?:\/\//, '').split('.')[0] : process.env.EXPO_OS === 'web' ? 'This site' : 'Not set'} sf="server.rack" md="dns" href="/settings/server" />
          {queued.length > 0 && <Row label="Waiting to send" value={String(queued.length)} sf="icloud.and.arrow.up" md="cloud_upload" href="/settings/server" />}
        </Group>
        <Group header="Backups" footer={backups.data ? `${backups.data.count} nightly snapshots on x1. Your Mac copies them to iCloud each day.` : undefined}>
          <Row label="Last backup" chevron={false}
            leading={<Icon sf={stale ? 'exclamationmark.triangle.fill' : 'checkmark.shield'} md={stale ? 'warning' : 'verified_user'} size={18} color={stale ? c.neg : c.label2} />}
            value={<Txt variant="body" tone={stale ? 'neg' : 'label2'}>{last ? ago(last.at, now) : backups.isLoading ? '' : 'None found'}</Txt>} />
        </Group>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Txt variant="foot" tone="label2">Tally {Constants.expoConfig?.version ?? ''}</Txt>
          <Txt variant="foot" tone="label3">Your data lives on x1. This app is a window onto it.</Txt>
        </View>
      </ScrollView>
    </>
  )
}
