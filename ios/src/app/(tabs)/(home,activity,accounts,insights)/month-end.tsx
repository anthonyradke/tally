// Month end, three steps: type investment balances, confirm savings interest, reconcile cash and cards.
import { useEffect, useState } from 'react'
import { ScrollView, TextInput, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import { Icon } from '@/components/Icon'
import { Group, Row } from '@/components/Row'
import { Arrive, StateView } from '@/components/StateView'
import { Button } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { api, ApiError, type Account } from '@/lib/api'
import { invalidateAll } from '@/lib/data'
import { dayLabel, monthLabel, monthOf } from '@/lib/dates'
import { fromCents } from '@/lib/draft'
import { amountsById } from '@/lib/forms'
import { formatCents } from '@/lib/money'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { radius, space, useTheme } from '@/theme'

export default function MonthEnd() {
  const params = useLocalSearchParams<{ month?: string }>()
  const { c } = useTheme()
  const t = useTally()
  const qc = useQueryClient()
  // Default to last month in the first week of a new month, else this month.
  const ym = params.month ?? (t.b ? (() => {
    const d = new Date(`${t.b.today}T00:00:00`)
    if (d.getDate() <= 7) d.setMonth(d.getMonth() - 1)
    return monthOf(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`).slice(0, 7)
  })() : '')
  const q = useQuery({ queryKey: ['month-end', ym], queryFn: () => api.monthEnd(ym), enabled: !!ym })
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [interest, setInterest] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!q.data) return
    setTyped(Object.fromEntries(Object.entries(q.data.typed).map(([k, v]) => [k, v == null ? '' : fromCents(v)])))
    setInterest(Object.fromEntries(Object.entries(q.data.interest).map(([k, v]) => [k, v.logged.length ? '' : v.proposed ? fromCents(v.proposed) : ''])))
  }, [q.data])
  const b = t.b
  const d = q.data
  const [waited] = useState(!b || !d) // the skeleton showed first
  if (!b || !d) return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }}><StateView q={b ? q : t.q} /></ScrollView>

  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['month-end'] }); await invalidateAll() }
  const typos = (bad: string[]) => {
    if (!bad.length) return false
    toast({ text: `Check the amount for ${bad.map((k) => acct(k)?.name ?? k).join(' and ')}.`, tone: 'error' })
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
    return true
  }
  const saveTyped = async () => {
    const { cents, bad } = amountsById(typed)
    if (typos(bad)) return
    try {
      await api.monthEndTyped(ym, cents)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      toast({ text: 'Balances saved' }); await refresh()
    } catch (e) { toast({ text: e instanceof ApiError ? e.errors.join(' ') : 'Tally is unreachable.', tone: 'error' }) }
  }
  const saveInterest = async () => {
    const { cents, bad } = amountsById(interest, true)
    if (typos(bad)) return
    try {
      await api.monthEndInterest(ym, cents)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      toast({ text: 'Interest logged' }); await refresh()
    } catch (e) { toast({ text: e instanceof ApiError ? e.errors.join(' ') : 'Tally is unreachable.', tone: 'error' }) }
  }
  const acct = (id: string) => t.acct.get(Number(id)) as Account
  // Steps number themselves: a month with no savings APY skips the interest step.
  const hasTyped = Object.keys(d.typed).length > 0, hasInterest = Object.keys(d.interest).length > 0
  const nInterest = hasTyped ? 2 : 1, nRecon = 1 + (hasTyped ? 1 : 0) + (hasInterest ? 1 : 0)
  return (
    <>
      <Stack.Screen options={{ title: `${monthLabel(`${ym}-01`, 'long')} close`, headerLargeTitle: false }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardDismissMode="interactive" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space.l, paddingBottom: 120 }}>
        <Arrive on={waited} style={{ gap: space.xxl }}>
        {Object.keys(d.typed).length > 0 && (
          <View style={{ gap: space.m }}>
            <Step n={1} title="Investment balances" done={d.typed_done} sub="What each one was worth at the end of the month." />
            <Group>
              {Object.keys(d.typed).map((k) => (
                <Row key={k} label={acct(k)?.name ?? k} chevron={false} value={
                  <Field value={typed[k] ?? ''} onChange={(v) => setTyped((s) => ({ ...s, [k]: v }))} />} />
              ))}
            </Group>
            <Button label="Save balances" onPress={saveTyped} secondary={d.typed_done} />
          </View>
        )}
        {Object.keys(d.interest).length > 0 && (
          <View style={{ gap: space.m }}>
            <Step n={nInterest} title="Savings interest" done={d.interest_done} sub="Suggested from each account's APY. Check the statement and adjust." />
            <Group>
              {Object.entries(d.interest).map(([k, v]) => v.logged.length ? (
                <Row key={k} label={acct(k)?.name ?? k} chevron={false} value={`${formatCents(v.logged.reduce((n, x) => n + x.amount, 0))} logged`}
                  trailing={<Icon sf="checkmark.circle.fill" md="check_circle" size={18} color={c.pos} />} />
              ) : (
                <Row key={k} label={acct(k)?.name ?? k} chevron={false} value={<Field value={interest[k] ?? ''} onChange={(val) => setInterest((s) => ({ ...s, [k]: val }))} />} />
              ))}
            </Group>
            {!d.interest_done && <Button label="Log interest" onPress={saveInterest} />}
          </View>
        )}
        <View style={{ gap: space.m }}>
          <Step n={nRecon} title="Reconcile" done={d.recon_done} sub="Check each balance against the bank once this month." />
          <Group>
            {Object.entries(d.recon).map(([k, r]) => (
              <Row key={k} label={acct(k)?.name ?? k}
                sub={r ? (r.actual === r.expected ? `Matched ${dayLabel(r.date, b.today)}` : `${formatCents(Math.abs(r.actual - r.expected))} off, ${dayLabel(r.date, b.today)}`) : 'Not yet'}
                leading={<Icon sf={r ? 'checkmark.circle.fill' : 'circle'} md={r ? 'check_circle' : 'radio_button_unchecked'} size={20} color={r ? (r.actual === r.expected ? c.pos : c.warn) : c.label3} />}
                onPress={() => router.push({ pathname: '/reconcile/[id]', params: { id: k } })} />
            ))}
          </Group>
        </View>
        </Arrive>
      </ScrollView>
    </>
  )
}

function Field({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { c } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.fill, borderRadius: radius.input, paddingHorizontal: space.m, height: 36, width: 128 }}>
      <Txt variant="body" tone="label2">$</Txt>
      <TextInput value={value} onChangeText={(v) => onChange(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={c.label3}
        style={{ flex: 1, minWidth: 48, fontSize: 17, color: c.label, textAlign: 'right', fontVariant: ['tabular-nums'] }} />
    </View>
  )
}

/** A numbered step that turns into a check once it's done. */
function Step({ n, title, done, sub }: { n: number; title: string; done: boolean; sub: string }) {
  const { c } = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: space.m, alignItems: 'center', paddingHorizontal: space.xs }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.pos : c.fill }}>
        {done ? <Icon sf="checkmark" md="check" size={14} color="#FFFFFF" weight="bold" /> : <Txt variant="sub" style={{ fontWeight: '700' }}>{n}</Txt>}
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="headline">{title}</Txt>
        <Txt variant="foot" tone="label2">{sub}</Txt>
      </View>
    </View>
  )
}
