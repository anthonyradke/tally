// One account: its card (zoomed open from Accounts), its balance and how it got there month by month, then its
// entries. A card or bank account can wear a picture of the real card.
import { useMemo, useState } from 'react'
import { ScrollView, useWindowDimensions, View } from 'react-native'
import { Link, Stack, useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { useTransactions } from '@/lib/data'
import { fromISO } from '@/lib/dates'
import { useLedger } from '@/design/ledger'
import { KIND_LOOK } from '@/design/look'
import { space, usePalette } from '@/design/theme'
import { failure, success } from '@/design/haptics'
import { Card, Empty, Row, Section } from '@/design/ui/List'
import { notify } from '@/design/ui/Notice'
import { LineChart } from '@/design/ui/LineChart'
import { Logo } from '@/design/ui/Logo'
import { Rolling } from '@/design/ui/Money'
import { Txt } from '@/design/ui/Txt'
import { TxnRow } from '@/design/ui/TxnRow'
import { useCardFaces, WalletCard } from '@/design/ui/WalletCard'

const longMonth = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

export default function AccountPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const aid = Number(id)
  const p = usePalette()
  const L = useLedger()
  const a = L.acct.get(aid)
  const [scrub, setScrub] = useState<number | null>(null)
  const months = useMemo(() => (L.b?.months ?? []).filter((m) => m.month <= (L.month?.month ?? '')), [L.b, L.month])
  const list = useTransactions({ account: aid, sort: 'date', dir: 'desc', limit: 60 })
  const { width } = useWindowDimensions()
  const faces = useCardFaces()
  const client = useQueryClient()
  const art = faces.data?.[String(aid)]?.art
  const pickArt = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 })
    if (r.canceled || !r.assets[0]) return
    const x = r.assets[0]
    try {
      await api.uploadArt(aid, { uri: x.uri, name: x.fileName ?? 'card.jpg', type: x.mimeType ?? 'image/jpeg' })
      success(); await client.invalidateQueries({ queryKey: ['cards'] })
    } catch (e) {
      failure(); notify({ text: e instanceof ApiError ? e.errors.join(' ') : "Couldn't save the picture", symbol: 'exclamationmark.triangle.fill', hue: 'orange' })
    }
  }
  const removeArt = async () => {
    try { await api.deleteArt(aid); success(); await client.invalidateQueries({ queryKey: ['cards'] }) } catch { failure() }
  }
  if (!a) return <Empty symbol="questionmark.circle" title="Account Not Found" />
  const look = KIND_LOOK[a.kind]
  const wallet = a.kind === 'card' || a.kind === 'cash'
  const balance = scrub !== null ? months[scrub]?.balances[aid] ?? 0 : L.month?.balances[aid] ?? 0
  return (
    <>
      <Stack.Screen options={{ title: a.name }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }}
        contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 120 }}>
        {wallet ? (
          <Link.AppleZoomTarget>
            <View><WalletCard a={a} balance={L.month?.balances[aid] ?? 0} width={width - space.l * 2} /></View>
          </Link.AppleZoomTarget>
        ) : null}
        <Card pad style={{ gap: space.xs, paddingTop: space.xl }}>
          {!wallet && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, marginBottom: space.s }}>
              <Logo account={aid} symbol={look.symbol} color={p[look.hue]} size={44} />
              <View style={{ flex: 1 }}>
                <Txt v="headline" numberOfLines={1}>{a.name}</Txt>
                <Txt v="subhead" tone="label2">{look.one}</Txt>
              </View>
            </View>
          )}
          <Txt v="subhead" tone="label2" weight="600">{scrub !== null ? longMonth(months[scrub].month) : a.kind === 'card' || a.kind === 'loan' ? 'Balance Owed' : 'Balance'}</Txt>
          <Rolling cents={balance} />
          {months.length > 1 && (
            <View style={{ marginTop: space.l, marginHorizontal: -space.l }}>
              <LineChart points={months.map((m) => m.balances[aid] ?? 0)} color={p[look.hue]} onScrub={setScrub} />
            </View>
          )}
        </Card>
        {wallet && (
          <Section compact title="Card" footer={art ? undefined : 'Show a picture of the real card instead of the one Tally made.'}>
            <Row title={art ? 'Change Card Picture' : 'Choose Card Picture…'} tint onPress={pickArt} />
            {art ? <Row title="Remove Card Picture" destructive onPress={removeArt} /> : null}
          </Section>
        )}
        <Section title="Transactions" inset={70}>
          {(list.data?.items ?? []).map((t) => <TxnRow key={t.id} t={t} showDate />)}
        </Section>
        {list.data && !list.data.items.length && <Empty symbol="list.bullet.rectangle" title="No Transactions" />}
      </ScrollView>
    </>
  )
}
