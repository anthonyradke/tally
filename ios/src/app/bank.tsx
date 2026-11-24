// From the bank: bank rows on connected accounts that no entry in Tally stands for yet, each with Tally's guess at
// the entry (app/bank.py). The tick adds the guess as it is; tapping the row opens it to change the name, category
// or accounts first. "Add the sure ones" takes every guess Tally has seen agree before. Rows still pending at the
// bank are listed last, without a guess, since the bank can still change them.
import { useMemo, useState } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { router, Stack } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Icon } from '@/components/Icon'
import { Mark } from '@/components/Mark'
import { Money } from '@/components/Money'
import { Hairline, Panel } from '@/components/Panel'
import { StateView } from '@/components/StateView'
import { Button, Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { api, ApiError, type BankRow } from '@/lib/api'
import { bankFigure, CONFIDENCE, refreshBank, useBankInbox } from '@/lib/bank'
import { dayLabel } from '@/lib/dates'
import { close, useBusy } from '@/lib/nav'
import { play } from '@/lib/sound'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { radius, space, useTheme } from '@/theme'

const HEADER_LEFT = (
  <Stack.Toolbar placement="left">
    <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Close" onPress={() => close()} />
  </Stack.Toolbar>
)

export default function BankInbox() {
  const { c } = useTheme()
  const q = useBankInbox()
  const busy = useBusy()
  const [syncing, setSyncing] = useState(false)
  const rows = q.data ?? []
  const posted = rows.filter((r) => !r.pending)
  const pending = rows.filter((r) => r.pending)
  const sure = posted.filter((r) => r.guess?.confidence === 'sure')
  const days: [string, BankRow[]][] = []
  {
    const out = days
    for (const r of posted) {
      const d = r.authorized_date ?? r.date
      if (out.at(-1)?.[0] === d) out.at(-1)![1].push(r)
      else out.push([d, [r]])
    }
  }

  const sync = () => busy(async () => {
    setSyncing(true)
    try {
      const r = await api.bank.sync()
      const failed = Object.values(r.synced).find((x) => x.error)
      if (failed) toast({ text: failed.message ?? 'A bank could not be reached.', tone: 'error' })
      await refreshBank()
    } catch (e) {
      toast({ text: e instanceof ApiError ? e.errors.join(' ') : 'Sync failed.', tone: 'error' })
    } finally { setSyncing(false) }
  })

  const addSure = () => busy(async () => {
    try {
      const added = await api.bank.acceptSure()
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      play('add')
      await refreshBank()
      toast({
        text: added.length === 1 ? 'Added 1 entry' : `Added ${added.length} entries`,
        action: added.length ? { label: 'Undo', run: async () => { await api.bulk({ ids: added.map((t) => t.id), action: 'delete' }); await refreshBank() } } : undefined,
      })
    } catch (e) {
      toast({ text: e instanceof ApiError ? e.errors.join(' ') : 'Could not add them.', tone: 'error' })
    }
  })

  const header = useMemo(() => (
    <>
      <Stack.Screen options={{ title: 'From the bank' }} />
      {HEADER_LEFT}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="arrow.clockwise" accessibilityLabel="Check the banks now" onPress={() => sync()} />
      </Stack.Toolbar>
    </>
  ), []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {header}
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={sync} />}>
        {!q.data ? <StateView q={q} shape="list" /> : !rows.length ? (
          <View style={{ alignItems: 'center', gap: space.s, paddingTop: 80 }}>
            <Icon sf="checkmark.circle" md="check_circle" size={44} color={c.label3} />
            <Txt variant="title2">Caught up with the bank</Txt>
            <Txt variant="callout" tone="label2" style={{ textAlign: 'center' }}>Everything the banks show is in Tally. Pull down to check them again.</Txt>
          </View>
        ) : (
          <>
            {sure.length > 0 && (
              <Panel style={{ gap: space.m }}>
                <Txt variant="headline">{sure.length === 1 ? '1 entry Tally is sure about' : `${sure.length} entries Tally is sure about`}</Txt>
                <Txt variant="callout" tone="label2">{"Places you've named and filed the same way at least twice before."}</Txt>
                <Button label={sure.length === 1 ? 'Add it' : `Add all ${sure.length}`} onPress={addSure} />
              </Panel>
            )}
            {days.map(([day, list]) => (
              <View key={day} style={{ gap: 6 }}>
                <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l }}>{dayLabel(day)}</Txt>
                <View style={{ backgroundColor: c.panel, borderRadius: radius.panel, borderCurve: 'continuous', overflow: 'hidden' }}>
                  {list.map((r, i) => <View key={r.id}>{i > 0 && <Hairline inset={space.l + 40 + space.m} />}<Item r={r} /></View>)}
                </View>
              </View>
            ))}
            {pending.length > 0 && (
              <View style={{ gap: 6 }}>
                <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l }}>Still pending at the bank</Txt>
                <View style={{ backgroundColor: c.panel, borderRadius: radius.panel, borderCurve: 'continuous', overflow: 'hidden', opacity: 0.7 }}>
                  {pending.map((r, i) => <View key={r.id}>{i > 0 && <Hairline inset={space.l + 40 + space.m} />}<Item r={r} /></View>)}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </>
  )
}

function Item({ r }: { r: BankRow }) {
  const { c, tint } = useTheme()
  const t = useTally()
  const busy = useBusy()
  const g = r.guess
  const cat = g?.category_id != null ? t.cat.get(g.category_id) : undefined
  const name = g?.what ?? r.merchant ?? r.raw
  const spec = t.markFor(name)
  const v = cat ? t.visual(cat) : null
  const fig = bankFigure(r, t.acct.get(r.account_id))
  const add = () => busy(async () => {
    try {
      const e = await api.bank.accept(r.id)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      play('add')
      await refreshBank()
      toast({ text: `Added ${e.what}`, action: { label: 'Undo', run: async () => { await api.deleteTxn(e.id); await refreshBank() } } })
    } catch (err) {
      toast({ text: err instanceof ApiError ? err.errors.join(' ') : 'Could not add it.', tone: 'error' })
    }
  })
  const sub = cat ? cat.name : r.pending ? 'Pending' : CONFIDENCE.unknown
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    <Tap feedback="highlight" style={{ flex: 1 }} onPress={r.pending ? undefined : () => router.push({ pathname: '/bank-item', params: { id: String(r.id) } })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingLeft: space.l, paddingRight: g?.category_id != null && !r.pending ? space.s : space.l, paddingVertical: space.m }}>
        {spec ? <Mark kind="spec" spec={spec} /> : v ? <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} /> :
          <Mark kind="glyph" sf="questionmark" md="help" tint={c.label3} />}
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="row" numberOfLines={1}>{name}</Txt>
          <Txt variant="foot" tone={g?.confidence === 'unknown' ? 'warn' : 'label2'} numberOfLines={1}>{sub}</Txt>
          <Txt variant="foot" tone="label3" numberOfLines={1}>{r.raw}</Txt>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Money cents={fig.sign === 'minus' ? -fig.text : fig.text} sign={fig.sign === 'plus' ? 'always' : 'auto'} tone={fig.sign === 'plus' ? 'pos' : 'neutral'} />
          <Txt variant="foot" tone="label2" numberOfLines={1}>{r.bank_account}</Txt>
          {g && g.confidence !== 'unknown' && <Txt variant="foot" tone={g.confidence === 'sure' ? 'pos' : 'label3'}>{CONFIDENCE[g.confidence]}</Txt>}
        </View>
      </View>
    </Tap>
    {g && g.category_id != null && !r.pending && (
      <Tap feedback="scale" hitSlop={10} onPress={add} accessibilityLabel={`Add ${name}`} style={{ paddingRight: space.l }}>
        <Icon sf="checkmark.circle.fill" md="check_circle" size={28} color={c.ink} />
      </Tap>
    )}
    </View>
  )
}
