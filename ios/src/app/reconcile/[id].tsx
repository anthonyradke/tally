// Reconcile: type what the bank says, Tally compares it with its own balance (rows dated today or earlier) and, when
// they differ, points at the likely causes: possible duplicates, a single entry the size of the gap, future rows.
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import Animated from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useQueryClient } from '@tanstack/react-query'
import { closeSwipes } from '@/components/SwipeRow'
import { CheckDraw } from '@/components/CheckDraw'
import { Confetti } from '@/components/Confetti'
import { Icon } from '@/components/Icon'
import { Keypad } from '@/components/Keypad'
import { Hairline } from '@/components/Panel'
import { RollingText } from '@/components/Rolling'
import { useShake } from '@/components/Shake'
import { Button } from '@/components/Tap'
import { TxnRow } from '@/components/TxnRow'
import { Txt } from '@/components/Txt'
import { api, ApiError, type Diagnosis, type Txn } from '@/lib/api'
import { close } from '@/lib/nav'
import { fromCents, press, toCents } from '@/lib/draft'
import { formatCents } from '@/lib/money'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { radius, space, useTheme } from '@/theme'

export default function Reconcile() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { c } = useTheme()
  const t = useTally()
  const qc = useQueryClient()
  const a = t.acct.get(Number(id))
  const [amount, setAmount] = useState('')
  const [dx, setDx] = useState<Diagnosis | null>(null)
  const [busy, setBusy] = useState(false)
  const [party, setParty] = useState(0)
  const [shakeStyle, shake] = useShake()
  if (!a || !t.b) return null
  const owed = a.kind === 'card'

  const check = async (save = false) => {
    setBusy(true)
    try {
      const r = await api.reconcile(a.id, toCents(amount), save)
      setDx(r)
      if (save) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        qc.invalidateQueries({ queryKey: ['reconciliations'] })
        toast({ text: r.gap === 0 ? `${a.name} reconciled` : `Saved with a ${formatCents(Math.abs(r.gap))} gap` })
        close()
      } else {
        Haptics.notificationAsync(r.gap === 0 ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {})
        if (r.gap === 0) setParty((n) => n + 1) // matched to the cent
      }
    } catch (e) {
      toast({ text: e instanceof ApiError ? e.errors.join(' ') : 'Tally is unreachable.', tone: 'error' })
    } finally { setBusy(false) }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView onScrollBeginDrag={closeSwipes} contentContainerStyle={{ padding: space.l, paddingTop: space.xl, gap: space.l }}>
        <View style={{ gap: 4 }}>
          <Txt variant="title2" accessibilityRole="header">Reconcile {a.name}</Txt>
          <Txt variant="callout" tone="label2">{owed ? 'What does the card show as the current balance?' : 'What does the bank show right now?'}</Txt>
        </View>
        <View style={{ alignItems: 'center', paddingVertical: space.s }}>
          <Animated.View style={shakeStyle}><RollingText text={formatCents(toCents(amount))} style={{ fontSize: 52, fontWeight: '700', letterSpacing: -1.2, color: amount ? c.label : c.label3 }} /></Animated.View>
        </View>
        {dx && <Result dx={dx} />}
      </ScrollView>
      <View style={{ paddingHorizontal: space.l, paddingBottom: 34, gap: space.s }}>
        {!dx && <Keypad onKey={(k) => {
          const next = press(amount, k)
          if (next === amount && amount && k !== 'del') { shake(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}) }
          setAmount(next)
        }} onClear={() => setAmount('')} />}
        {!dx ? (
          <Button label={busy ? 'Checking…' : 'Check'} onPress={() => check(false)} disabled={busy || !amount} style={{ height: 52 }} />
        ) : dx.gap === 0 ? (
          <Button label="Mark as reconciled" onPress={() => check(true)} disabled={busy} style={{ height: 52 }} />
        ) : (
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <Button label="Change amount" secondary onPress={() => { setDx(null); setAmount(fromCents(toCents(amount))) }} style={{ flex: 1, height: 52 }} />
            <Button label="Save anyway" onPress={() => check(true)} disabled={busy} style={{ flex: 1, height: 52 }} />
          </View>
        )}
      </View>
      <Confetti fire={party} origin={{ x: 0.5, y: 0.32 }} />
    </View>
  )
}

function Result({ dx }: { dx: Diagnosis }) {
  const { c } = useTheme()
  const ok = dx.gap === 0
  return (
    <View style={{ gap: space.l }}>
      <View style={{ flexDirection: 'row', gap: space.m, alignItems: 'center', padding: space.l, borderRadius: radius.panel, backgroundColor: c.panel }}>
        {ok ? <CheckDraw size={30} color={c.pos} /> : <Icon sf="exclamationmark.triangle.fill" md="warning" size={28} color={c.warn} />}
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="headline">{ok ? 'It matches' : `Off by ${formatCents(Math.abs(dx.gap))}`}</Txt>
          <Txt variant="sub" tone="label2" num>Tally has {formatCents(dx.expected)}, the bank says {formatCents(dx.actual)}.</Txt>
        </View>
      </View>
      {!ok && (
        <>
          <Rows title="Half the gap" rows={dx.doubled} why="An entry going the wrong direction (or logged twice) would be off by twice its amount." />
          <Rows title="Exactly the gap" rows={dx.single} why="One entry the size of the gap: maybe it hasn't posted at the bank yet, or it's on the wrong account." />
          <Rows title="Dated in the future" rows={dx.future} why="Future-dated entries don't count yet." />
          {dx.doubled.length + dx.single.length + dx.future.length === 0 && (
            <Txt variant="callout" tone="label2" style={{ paddingHorizontal: space.xs }}>{"Nothing obvious. Look for an entry you haven't logged yet, or one with a typo in the amount."}</Txt>
          )}
        </>
      )}
    </View>
  )
}

/** The rows behind one likely cause of a gap. */
function Rows({ title, rows, why }: { title: string; rows: Txn[]; why: string }) {
  const { c } = useTheme()
  const t = useTally()
  if (rows.length === 0) return null
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l }}>{title}</Txt>
      <View style={{ backgroundColor: c.panel, borderRadius: radius.panel, overflow: 'hidden' }}>
        {rows.map((x, i) => (
          <View key={x.id}>{i > 0 && <Hairline inset={space.l + 40 + space.m} />}
            <TxnRow t={x} c={t.catOf(x)} acct={t.acct} mark={t.markFor(x.what)} today={t.b!.today} showDate={x.date} />
          </View>
        ))}
      </View>
      <Txt variant="foot" tone="label2" style={{ paddingHorizontal: space.l }}>{why}</Txt>
    </View>
  )
}
