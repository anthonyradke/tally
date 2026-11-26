// One account: its card (zoomed open from Accounts), its balance and how it got there month by month, then its
// entries signed like its statement. A credit card can wear a picture of the real card.
import { useMemo, useRef, useState } from 'react'
import { ScrollView, useWindowDimensions, View } from 'react-native'
import { Link, Stack, useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { fromISO } from '@/lib/dates'
import { pastMonths, useLedger } from '@/design/ledger'
import { bankName, KIND_LOOK } from '@/design/look'
import { space, usePalette } from '@/design/theme'
import { failure, success } from '@/design/haptics'
import { EntryList } from '@/design/ui/EntryList'
import { Card, Empty, Row, Section } from '@/design/ui/List'
import { loadGate } from '@/design/ui/LoadState'
import { notify } from '@/design/ui/Notice'
import { LineChart } from '@/design/ui/LineChart'
import { Logo } from '@/design/ui/Logo'
import { Rolling } from '@/design/ui/Money'
import { Txt } from '@/design/ui/Txt'
import { useCardFaces, WalletCard } from '@/design/ui/WalletCard'

const longMonth = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

export default function AccountPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const aid = Number(id)
  const p = usePalette()
  const L = useLedger()
  const gate = loadGate(L.q)
  const a = L.acct.get(aid)
  const [scrub, setScrub] = useState<number | null>(null)
  // Balances carry over: the latest month up to today holds today's, even before a month just begun has its row.
  const months = useMemo(() => pastMonths(L.b, L.today), [L.b, L.today])
  const { width } = useWindowDimensions()
  const faces = useCardFaces()
  const client = useQueryClient()
  const art = faces.data?.[String(aid)]?.art
  const busy = useRef(false)
  const pickArt = async () => {
    if (busy.current) return
    busy.current = true
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 })
      if (r.canceled || !r.assets[0]) return
      const x = r.assets[0]
      await api.uploadArt(aid, { uri: x.uri, name: x.fileName ?? 'card.jpg', type: x.mimeType ?? 'image/jpeg' })
      success(); await client.invalidateQueries({ queryKey: ['cards'] })
    } catch (e) {
      failure(); notify({ text: e instanceof ApiError ? e.errors.join(' ') : "Couldn't save the picture", symbol: 'exclamationmark.triangle.fill', hue: 'orange' })
    } finally {
      busy.current = false
    }
  }
  const removeArt = async () => {
    if (busy.current) return
    busy.current = true
    try { await api.deleteArt(aid); success(); await client.invalidateQueries({ queryKey: ['cards'] }) } catch { failure() } finally { busy.current = false }
  }
  if (gate.block) return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }}>{gate.block}</ScrollView>
  if (!a) return <Empty symbol="questionmark.circle" title="Account Not Found" />
  const look = KIND_LOOK[a.kind]
  const wallet = a.kind === 'card' || a.kind === 'cash'
  const owed = a.kind === 'card' || a.kind === 'loan'
  const now = months[months.length - 1]?.balances[aid] ?? 0
  const raw = scrub !== null ? months[scrub]?.balances[aid] ?? 0 : now
  // A card or loan paid past zero is a credit, not "−$50 owed".
  const credit = scrub === null && owed && raw < 0
  const bank = bankName(a)

  const header = (
    <View style={{ gap: space.xxl }}>
      {gate.note}
      {wallet ? (
        <Link.AppleZoomTarget>
          <View><WalletCard a={a} balance={now} width={width - space.l * 2} compact /></View>
        </Link.AppleZoomTarget>
      ) : null}
      <Card pad style={{ gap: space.xs, paddingTop: space.xl }}>
        {!wallet && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, marginBottom: space.s }}>
            <Logo account={aid} symbol={look.symbol} color={p[look.hue]} size={44} />
            <View style={{ flex: 1 }}>
              <Txt v="headline" numberOfLines={1}>{bank ?? look.one}</Txt>
              {bank ? <Txt v="subhead" tone="label2">{look.one}</Txt> : null}
            </View>
          </View>
        )}
        <Txt v="subhead" tone="label2" weight="600">{scrub !== null ? longMonth(months[scrub].month) : credit ? 'Credit' : owed ? 'Balance Owed' : 'Balance'}</Txt>
        <Rolling cents={credit ? -raw : raw} />
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
    </View>
  )
  return (
    <>
      <Stack.Screen options={{ title: a.name }} />
      <EntryList query={{ account: aid }} header={header} account={a} />
    </>
  )
}
