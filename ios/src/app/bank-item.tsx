// One bank row from the inbox, opened to change Tally's guess before adding it: the name, the category, and for a
// transfer, loan payment or saving the account on the other side. Ignore keeps it out of the inbox for good (a row the
// ledger has another way, say a split). The row comes from the inbox already loaded.
import { useMemo, useState } from 'react'
import { ScrollView, TextInput, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Chip } from '@/components/Chip'
import { Money } from '@/components/Money'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { api, ApiError, type CatType } from '@/lib/api'
import { bankFigure, cachedRow, CONFIDENCE, refreshBank } from '@/lib/bank'
import { dayLabel } from '@/lib/dates'
import { useBusy, useCloseHere } from '@/lib/nav'
import { play } from '@/lib/sound'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { radius, space, useTheme } from '@/theme'

const OTHER_SIDE: CatType[] = ['Transfer', 'Loan', 'Saving']

export default function BankItem() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const r = cachedRow(Number(id))
  const { c } = useTheme()
  const t = useTally()
  const busy = useBusy()
  const closeHere = useCloseHere()
  const g = r?.guess
  const [what, setWhat] = useState(g?.what ?? r?.merchant ?? '')
  const [cat, setCat] = useState<number | null>(g?.category_id ?? null)
  const here = r?.account_id
  const guessOther = g ? (g.from_id === here ? g.to_id : g.from_id) : null
  const [other, setOther] = useState<number | null>(guessOther)
  const out = (r?.amount ?? 0) > 0
  const type = cat != null ? t.cat.get(cat)?.type : undefined

  // Money out: spending first, then the ways money moves on; money in: income first, then refunds and transfers in.
  const groups = useMemo(() => {
    const order: CatType[] = out ? ['Spending', 'Transfer', 'Loan', 'Saving', 'Money in'] : ['Money in', 'Transfer', 'Spending', 'Loan', 'Saving']
    const active = (t.b?.categories ?? []).filter((x) => x.active)
    return order.map((ty) => [ty, active.filter((x) => x.type === ty)] as const).filter(([, l]) => l.length)
  }, [t.b, out])
  const others = (t.b?.accounts ?? []).filter((a) => a.active && a.id !== here)

  if (!r) {
    return <View style={{ padding: space.xl }}><Txt variant="callout" tone="label2">This one is no longer waiting. Close and pull to refresh.</Txt></View>
  }
  const fig = bankFigure(r, t.acct.get(r.account_id))
  const needsOther = type === 'Transfer'
  const sides = (): { from_id: number | null; to_id: number | null } => {
    if (type === 'Spending') return { from_id: here!, to_id: null }
    if (type === 'Money in') return { from_id: null, to_id: here! }
    return out ? { from_id: here!, to_id: other } : { from_id: other, to_id: here! }
  }
  const add = () => busy(async () => {
    if (cat == null) { toast({ text: 'Pick a category first.', tone: 'error' }); return }
    if (needsOther && other == null) { toast({ text: 'Pick the other account for a transfer.', tone: 'error' }); return }
    try {
      const e = await api.bank.accept(r.id, { what: what.trim() || g?.what, category_id: cat, ...sides() })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      play('add')
      await refreshBank()
      toast({ text: `Added ${e.what}`, action: { label: 'Undo', run: async () => { await api.deleteTxn(e.id); await refreshBank() } } })
      closeHere()
    } catch (err) {
      play('error')
      toast({ text: err instanceof ApiError ? err.errors.join(' ') : 'Could not add it.', tone: 'error' })
    }
  })
  const ignore = () => busy(async () => {
    await api.bank.ignore(r.id)
    await refreshBank()
    toast({ text: 'Ignored', action: { label: 'Undo', run: async () => { await api.bank.reset(r.id); await refreshBank() } } })
    closeHere()
  })

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space.l, paddingTop: space.xxl, gap: space.xl, paddingBottom: 60 }}
      keyboardDismissMode="interactive">
      <View style={{ gap: space.xs }}>
        <Money variant="title" cents={fig.sign === 'minus' ? -fig.text : fig.text} sign={fig.sign === 'plus' ? 'always' : 'auto'} tone={fig.sign === 'plus' ? 'pos' : 'neutral'} />
        <Txt variant="callout" tone="label2">{r.bank_account}, {dayLabel(r.authorized_date ?? r.date)}</Txt>
        <Txt variant="foot" tone="label3" selectable>{r.raw}</Txt>
        {g && <Txt variant="foot" tone={g.confidence === 'unknown' ? 'warn' : 'label2'}>{CONFIDENCE[g.confidence]}. {g.why}.</Txt>}
      </View>

      <View style={{ gap: 6 }}>
        <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l }}>What was it?</Txt>
        <TextInput value={what} onChangeText={setWhat} placeholder="Name" placeholderTextColor={c.label3} autoCorrect={false}
          style={{ backgroundColor: c.panel, borderRadius: radius.input, paddingHorizontal: space.l, paddingVertical: space.m, fontSize: 17, color: c.label }} />
      </View>

      {groups.map(([ty, list]) => (
        <View key={ty} style={{ gap: 6 }}>
          <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l }}>{ty}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {list.map((x) => <Chip key={x.id} label={x.name} selected={cat === x.id} onPress={() => setCat(x.id)} />)}
          </View>
        </View>
      ))}

      {type && OTHER_SIDE.includes(type) && (
        <View style={{ gap: 6 }}>
          <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l }}>{out ? 'To' : 'From'}{type !== 'Transfer' ? ' (optional)' : ''}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {others.map((a) => <Chip key={a.id} label={a.name} selected={other === a.id} onPress={() => setOther(other === a.id && type !== 'Transfer' ? null : a.id)} />)}
          </View>
        </View>
      )}

      <Panel style={{ gap: space.s }}>
        <Button label="Add to Tally" onPress={add} disabled={cat == null} />
        <Button label="Ignore" secondary onPress={ignore} />
        <Txt variant="foot" tone="label2">{"Ignore it when it's already in Tally some other way, like a split. It won't come back."}</Txt>
      </Panel>
    </ScrollView>
  )
}
