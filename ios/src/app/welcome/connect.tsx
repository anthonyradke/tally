// Setup, step one: sign in to each bank through Plaid. Each one drops into the list with its logo as it links.
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api, ApiError } from '@/lib/api'
import { openPlaidLink } from '@/lib/bank'
import { failure, success } from '@/design/haptics'
import { rise } from '@/design/motion'
import { useLeaveIfSetUp, useSetupStatus } from '@/design/setup'
import { space, usePalette } from '@/design/theme'
import { Button } from '@/design/ui/Button'
import { Card } from '@/design/ui/List'
import { Logo } from '@/design/ui/Logo'
import { notify } from '@/design/ui/Notice'
import { SF } from '@/design/ui/SF'
import { Txt } from '@/design/ui/Txt'

export default function Connect() {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  useLeaveIfSetUp()
  const s = useSetupStatus()
  const [busy, setBusy] = useState<'link' | 'test' | null>(null)
  const items = s.data?.items ?? []
  const run = async (kind: 'link' | 'test') => {
    setBusy(kind)
    try {
      if (kind === 'test') await api.bank.sandbox()
      else {
        const { link_token } = await api.bank.linkToken()
        const pt = await openPlaidLink(link_token)
        if (!pt) return
        await api.bank.connect(pt)
      }
      success()
      await s.refetch()
    } catch (e) {
      failure()
      notify({ text: e instanceof ApiError ? e.errors.join(' ') : e instanceof Error ? e.message : "Couldn't connect", symbol: 'exclamationmark.triangle.fill', hue: 'orange' })
    } finally { setBusy(null) }
  }
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, space.l) }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: 56, gap: space.xxl }}>
        <View style={{ alignItems: 'center', gap: space.m }}>
          <SF name="building.columns.fill" size={52} color={p.blue} />
          <Txt v="largeTitle" center>Add Your Banks</Txt>
          <Txt v="body" tone="label2" center>Sign in to each bank you use. You can add more later in Settings.</Txt>
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
          </Card>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: space.xl, gap: space.m }}>
        <Button label={items.length ? 'Add Another Bank' : 'Add a Bank'} symbol="plus" kind={items.length ? 'tinted' : 'filled'} onPress={() => run('link')} busy={busy === 'link'} />
        {s.data?.env === 'sandbox' && <Button label="Add a Test Bank" kind="plain" onPress={() => run('test')} busy={busy === 'test'} />}
        {items.length > 0 && <Button label="Continue" onPress={() => router.push('/welcome/accounts')} />}
      </View>
    </View>
  )
}
