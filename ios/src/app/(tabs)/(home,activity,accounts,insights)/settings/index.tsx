import { useState } from 'react'
import { ScrollView, Switch, View } from 'react-native'
import { Stack } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Constants from 'expo-constants'
import { Icon } from '@/components/Icon'
import { Group, Row } from '@/components/Row'
import { Txt } from '@/components/Txt'
import { api, ApiError, type Health } from '@/lib/api'
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

/** The server's health; an older server without /health still answers /backups. */
async function loadHealth(): Promise<Health> {
  try {
    return await api.health()
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e
    return { version: '', database: 'ok', backups: await api.backups(), offsite: null }
  }
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
  const health = useQuery({ queryKey: ['health'], queryFn: loadHealth })
  const h = health.data
  const last = h?.backups.latest
  const offsite = h?.offsite?.last_success
  const [now] = useState(() => Date.now())
  const old = (iso: string | null | undefined) => !iso || now - new Date(iso).getTime() > 36 * 36e5
  // No snapshot at all is a warning too: the server not seeing its backups folder used to read as a quiet "None".
  const stale = !!h && old(last?.at)
  const offStale = !!h?.offsite && (old(offsite) || h.offsite.result !== 'ok')
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
          <Row label="Recently deleted" sub="Entries deleted in the last 30 days" sf="trash" md="delete" href="/settings/deleted" />
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
          <Row label="Activity filters" sub="Choose and order the chip rows above Activity" sf="line.3.horizontal.decrease.circle" md="filter_list" href="/settings/activity" />
          <Row label="Hide amounts" sub="Every figure reads $••• until you switch it off. The eye on Home does the same." sf="eye.slash" md="visibility_off" chevron={false}
            trailing={<Switch value={hidden} onValueChange={(v) => usePrivacy.getState().set(v)} />} />
          <Row label="Sounds" sub="Soft clicks and chimes under the haptics. The silent switch mutes them." sf="speaker.wave.2" md="volume_up" chevron={false}
            trailing={<Switch value={sounds} onValueChange={(v) => { useSounds.getState().set(v); if (v) play('toggle') }} />} />
          <Row label="Lock with Face ID" sub="Asks when Tally opens, and when you come back after a minute away." sf="faceid" md="lock" chevron={false}
            trailing={<Switch value={locking} onValueChange={(v) => setLockEnabled(v).then((ok) => { if (!ok) toast({ text: "Face ID isn't available, or it didn't match. Tally stays unlocked.", tone: 'error' }) })} />} />
          <Row label="Server" value={url ? url.replace(/^https?:\/\//, '').split('.')[0] : process.env.EXPO_OS === 'web' ? 'This site' : 'Not set'} sf="server.rack" md="dns" href="/settings/server" />
          {queued.length > 0 && <Row label="Waiting to send" value={String(queued.length)} sf="icloud.and.arrow.up" md="cloud_upload" href="/settings/server" />}
        </Group>
        <Group header="Backups" footer={h ? `${h.backups.count} nightly snapshots on the server${h.offsite ? ', and an off-site copy' : ''}. Your Mac copies them to iCloud each day.` : undefined}>
          <Row label="On the server" chevron={false}
            leading={<Icon sf={stale ? 'exclamationmark.triangle.fill' : 'checkmark.shield'} md={stale ? 'warning' : 'verified_user'} size={18} color={stale ? c.neg : c.label2} />}
            value={<Txt variant="body" tone={stale ? 'neg' : 'label2'}>{last ? ago(last.at, now) : health.isLoading ? '' : health.isError ? 'Unknown' : 'None found'}</Txt>} />
          {h?.offsite && (
            <Row label="Off-site" chevron={false}
              leading={<Icon sf={offStale ? 'exclamationmark.triangle.fill' : 'icloud'} md={offStale ? 'warning' : 'cloud_done'} size={18} color={offStale ? c.neg : c.label2} />}
              value={<Txt variant="body" tone={offStale ? 'neg' : 'label2'}>{offsite ? ago(offsite, now) : 'Never'}</Txt>} />
          )}
          {h?.database === 'damaged' && (
            <Row label="Database check" chevron={false} leading={<Icon sf="exclamationmark.triangle.fill" md="warning" size={18} color={c.neg} />}
              value={<Txt variant="body" tone="neg">Failed</Txt>} />
          )}
        </Group>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Txt variant="foot" tone="label2">Tally {Constants.expoConfig?.version ?? ''}{h?.version && h.version !== Constants.expoConfig?.version ? ` · server ${h.version}` : ''}</Txt>
          <Txt variant="foot" tone="label3">Your data lives on your server. This app is a window onto it.</Txt>
        </View>
      </ScrollView>
    </>
  )
}
