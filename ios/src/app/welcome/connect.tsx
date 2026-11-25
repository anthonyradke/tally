// Setup, step one: sign in to each bank through Plaid. Each one drops into the list with its logo as it links.
import { useState } from 'react'
import { ActivityIndicator, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api, ApiError } from '@/lib/api'
import { linkBanks } from '@/lib/bank'
import { useBusy } from '@/design/busy'
import { why } from '@/design/checkin'
import { failure, success } from '@/design/haptics'
import { rise } from '@/design/motion'
import { leaveWelcome, useLeaveIfSetUp, useSetupStatus } from '@/design/setup'
import { space, usePalette } from '@/design/theme'
import { Button } from '@/design/ui/Button'
import { Card, Empty } from '@/design/ui/List'
import { Logo } from '@/design/ui/Logo'
import { Press } from '@/design/ui/Press'
import { notify } from '@/design/ui/Notice'
import { SF } from '@/design/ui/SF'
import { Txt } from '@/design/ui/Txt'

export default function Connect() {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  useLeaveIfSetUp()
  const s = useSetupStatus()
  const [busy, setBusy] = useState<'link' | 'test' | null>(null)
  const guard = useBusy()
  const items = s.data?.items ?? []
  // The list is fetched again whatever /connect said: Plaid's webhook can connect the bank first, and then /connect
  // finds nothing new ("already connected") although the bank is there.
  const run = (kind: 'link' | 'test') => guard.run(async () => {
    setBusy(kind)
    const before = items.length
    let error: unknown = null
    try {
      if (kind === 'test') await api.bank.sandbox()
      else await linkBanks()
    } catch (e) { error = e }
    try {
      const after = (await s.refetch()).data?.items.length ?? before
      const already = error instanceof ApiError && /already connected/i.test(error.errors.join(' ')) && after > 0
      if (after > before || already) success()
      else if (error) {
        failure()
        notify({ text: why(error, "Couldn't connect"), symbol: 'exclamationmark.triangle.fill', hue: 'orange' })
      }
    } finally { setBusy(null) }
  })
  if (!s.data && s.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top + 56, paddingHorizontal: space.xl }}>
        <Empty symbol="icloud.slash" title="Can’t Reach Tally" body={why(s.error, 'Check your connection and try again.')}>
          <Button label="Try Again" kind="tinted" onPress={() => s.refetch()} style={{ marginTop: space.l, alignSelf: 'stretch' }} />
          <Button label="Not Now" kind="plain" onPress={leaveWelcome} style={{ alignSelf: 'stretch' }} />
        </Empty>
      </View>
    )
  }
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, space.l) }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: 56, paddingBottom: space.xl, gap: space.xxl }}>
        <View style={{ alignItems: 'center', gap: space.m }}>
          <SF name="building.columns.fill" size={52} color={p.tint} />
          <Txt v="largeTitle" center>Add Your Banks</Txt>
          <Txt v="body" tone="label2" center>Sign in to the banks you use. You can add more later in Settings.</Txt>
        </View>
        {items.length > 0 && (
          <Card>
            {items.map((it, i) => (
              <Animated.View key={it.id} entering={rise(0)}>
                {i > 0 && <View style={{ height: 0.5, backgroundColor: p.separator, marginLeft: 68 }} />}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.l }}>
                  <Logo item={it.id} name={it.brand || it.institution || undefined} letter size={40} />
                  <View style={{ flex: 1 }}>
                    <Txt v="body" numberOfLines={1}>{it.institution ?? 'Bank'}</Txt>
                    <Txt v="subhead" tone="label2">{it.accounts.length} {it.accounts.length === 1 ? 'account' : 'accounts'}</Txt>
                  </View>
                  <SF name="checkmark.circle.fill" size={24} color={p.green} />
                </View>
              </Animated.View>
            ))}
            <View style={{ height: 0.5, backgroundColor: p.separator, marginLeft: 68 }} />
            <Press feel="highlight" haptic={false} onPress={() => run('link')} disabled={!!busy}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.l }}>
                <View style={{ width: 40, alignItems: 'center' }}>
                  {busy === 'link' ? <ActivityIndicator color={p.tint} /> : <SF name="plus.circle.fill" size={28} color={p.tint} />}
                </View>
                <Txt v="body" tone="tint">Add Another Bank</Txt>
              </View>
            </Press>
          </Card>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.m, gap: space.m }}>
        {!items.length && <Button label="Add a Bank" symbol="plus" onPress={() => run('link')} busy={busy === 'link'} />}
        {s.data?.env === 'sandbox' && <Button label="Add a Test Bank" kind="plain" onPress={() => run('test')} busy={busy === 'test'} />}
        {items.length > 0 && <Button label="Continue" onPress={() => router.push('/welcome/accounts')} />}
        {!items.length && <Button label="Not Now" kind="plain" onPress={leaveWelcome} />}
      </View>
    </View>
  )
}
