// New from the bank: what opening Tally brings up when the banks have something (components/BankCheckIn.tsx).
// Kept to three short answers: which of your accounts a new bank account is, the rows Tally has a guess for (all
// ticked; one button adds them), and the rows it doesn't (a category chip adds each). Tapping a row opens the full
// sheet to change the name, category or accounts first.
import { useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { router, Stack } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Chip } from '@/components/Chip'
import { Icon } from '@/components/Icon'
import { Mark } from '@/components/Mark'
import { Money } from '@/components/Money'
import { Hairline } from '@/components/Panel'
import { StateView } from '@/components/StateView'
import { Button, Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { api, ApiError, type BankAsk, type BankRow, type CatType } from '@/lib/api'
import { bankFigure, CONFIDENCE, refreshBank, useBank, useBankInbox } from '@/lib/bank'
import { close, useBusy } from '@/lib/nav'
import { play } from '@/lib/sound'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { radius, space, useTheme } from '@/theme'

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.errors.join(' ') : fallback)
const INSET = space.l + 40 + space.m

const HEADER = (
  <>
    <Stack.Screen options={{ title: 'From the bank' }} />
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Close" onPress={() => close()} />
    </Stack.Toolbar>
  </>
)

export default function BankNew() {
  const { c } = useTheme()
  const q = useBankInbox()
  const s = useBank().data
  const busy = useBusy()
  const [off, setOff] = useState<Set<number>>(() => new Set())
  const rows = q.data ?? []
  const posted = rows.filter((r) => !r.pending)
  const ready = posted.filter((r) => r.guess?.category_id != null)
  const needs = posted.filter((r) => r.guess?.category_id == null)
  const pending = rows.length - posted.length
  const asks = s?.ask ?? []
  const picked = ready.filter((r) => !off.has(r.id))

  const addPicked = () => busy(async () => {
    try {
      const added = await api.bank.acceptMany(picked.map((r) => r.id))
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      play('add')
      await refreshBank()
      setOff(new Set())
      toast({
        text: added.length === 1 ? 'Added 1 entry' : `Added ${added.length} entries`,
        action: added.length ? { label: 'Undo', run: async () => { await api.bulk({ ids: added.map((t) => t.id), action: 'delete' }); await refreshBank() } } : undefined,
      })
    } catch (e) {
      play('error')
      toast({ text: errText(e, 'Could not add them.'), tone: 'error' })
    }
  })

  const done = q.data && !posted.length && !asks.length
  return (
    <>
      {HEADER}
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 80 }}>
        {!q.data ? <StateView q={q} shape="list" /> : done ? (
          <View style={{ alignItems: 'center', gap: space.s, paddingTop: 80 }}>
            <Icon sf="checkmark.circle" md="check_circle" size={44} color={c.pos} />
            <Txt variant="title2">All caught up</Txt>
            <Txt variant="callout" tone="label2" style={{ textAlign: 'center' }}>Everything the banks show is in Tally.</Txt>
            <Button label="Done" onPress={() => close()} style={{ alignSelf: 'stretch', marginTop: space.l }} />
          </View>
        ) : (
          <>
            {asks.map((a) => <Ask key={a.id} a={a} />)}

            {ready.length > 0 && (
              <Section title={ready.length === 1 ? 'Ready to add' : `Ready to add (${ready.length})`}>
                {ready.map((r, i) => (
                  <View key={r.id}>
                    {i > 0 && <Hairline inset={INSET} />}
                    <Line r={r} right={
                      <Tap feedback="scale" hitSlop={10} accessibilityLabel={off.has(r.id) ? `Include ${r.guess?.what}` : `Leave out ${r.guess?.what}`}
                        onPress={() => setOff((o) => { const n = new Set(o); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })}
                        style={{ paddingRight: space.l, paddingLeft: space.s }}>
                        <Icon sf={off.has(r.id) ? 'circle' : 'checkmark.circle.fill'} md={off.has(r.id) ? 'radio_button_unchecked' : 'check_circle'} size={26} color={off.has(r.id) ? c.label3 : c.ink} />
                      </Tap>
                    } />
                  </View>
                ))}
                <View style={{ padding: space.l, paddingTop: space.s }}>
                  <Button label={picked.length === 1 ? 'Add 1' : `Add ${picked.length}`} onPress={addPicked} disabled={!picked.length} />
                </View>
              </Section>
            )}

            {needs.length > 0 && (
              <Section title={needs.length === 1 ? 'What was this?' : `What were these? (${needs.length})`}>
                {needs.map((r, i) => <View key={r.id}>{i > 0 && <Hairline inset={space.l} />}<Needs r={r} /></View>)}
              </Section>
            )}

            {pending > 0 && (
              <Txt variant="foot" tone="label2" style={{ paddingHorizontal: space.l }}>
                {pending === 1 ? '1 more is still pending at the bank. It shows up here once it posts.' : `${pending} more are still pending at the bank. They show up here once they post.`}
              </Txt>
            )}
            <Button label="Later" secondary onPress={() => close()} />
          </>
        )}
      </ScrollView>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { c } = useTheme()
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l }}>{title}</Txt>
      <View style={{ backgroundColor: c.panel, borderRadius: radius.panel, borderCurve: 'continuous', overflow: 'hidden' }}>{children}</View>
    </View>
  )
}

/** One bank row: its mark, Tally's name for it, the category (or the bank's own text) and the amount. Tapping it
 *  opens the full sheet. */
function Line({ r, right }: { r: BankRow; right?: React.ReactNode }) {
  const { c, tint } = useTheme()
  const t = useTally()
  const g = r.guess
  const cat = g?.category_id != null ? t.cat.get(g.category_id) : undefined
  const name = g?.what ?? r.merchant ?? r.raw
  const spec = t.markFor(name)
  const v = cat ? t.visual(cat) : null
  const fig = bankFigure(r, t.acct.get(r.account_id))
  const sub = [cat?.name, t.acct.get(r.account_id)?.name ?? r.bank_account].filter(Boolean).join(' · ')
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Tap feedback="highlight" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/bank-item', params: { id: String(r.id) } })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingLeft: space.l, paddingRight: right ? 0 : space.l, paddingVertical: space.m }}>
          {spec ? <Mark kind="spec" spec={spec} /> : v ? <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} /> :
            <Mark kind="glyph" sf="questionmark" md="help" tint={c.label3} />}
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="row" numberOfLines={1}>{name}</Txt>
            <Txt variant="foot" tone="label2" numberOfLines={1}>{cat ? sub : r.raw}</Txt>
            {g && cat && g.confidence !== 'sure' && <Txt variant="foot" tone="label3" numberOfLines={1}>{CONFIDENCE[g.confidence]}</Txt>}
          </View>
          <Money cents={fig.sign === 'minus' ? -fig.text : fig.text} sign={fig.sign === 'plus' ? 'always' : 'auto'} tone={fig.sign === 'plus' ? 'pos' : 'neutral'} />
        </View>
      </Tap>
      {right}
    </View>
  )
}

/** A row Tally has no category for: a chip per likely category adds it in one tap; More opens the full sheet. */
function Needs({ r }: { r: BankRow }) {
  const t = useTally()
  const busy = useBusy()
  const out = r.amount > 0
  const chips = useMemo(() => {
    const want: CatType = out ? 'Spending' : 'Money in'
    return (t.b?.categories ?? []).filter((x) => x.active && x.type === want)
  }, [t.b, out])
  const pick = (id: number) => busy(async () => {
    try {
      const e = await api.bank.accept(r.id, { category_id: id })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      play('add')
      await refreshBank()
      toast({ text: `Added ${e.what}`, action: { label: 'Undo', run: async () => { await api.deleteTxn(e.id); await refreshBank() } } })
    } catch (err) {
      play('error')
      toast({ text: errText(err, 'Could not add it.'), tone: 'error' })
    }
  })
  return (
    <View style={{ paddingBottom: space.m }}>
      <Line r={r} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l }}>
        {chips.map((x) => <Chip key={x.id} label={x.name} onPress={() => pick(x.id)} />)}
        <Chip label="More…" onPress={() => router.push({ pathname: '/bank-item', params: { id: String(r.id) } })} />
      </ScrollView>
    </View>
  )
}

/** A bank account nobody has placed yet: which of Tally's accounts it is, or none. */
function Ask({ a }: { a: BankAsk }) {
  const { c } = useTheme()
  const t = useTally()
  const s = useBank().data
  const busy = useBusy()
  const taken = new Set((s?.items ?? []).flatMap((i) => i.accounts.map((x) => x.tally_account_id)).filter((x) => x != null))
  const options = (t.b?.accounts ?? []).filter((x) => x.active && a.kinds.includes(x.kind) && !taken.has(x.id))
  const pick = (id: number | null) => busy(async () => {
    try {
      const r = await api.bank.mapAccount(a.id, id)
      Haptics.selectionAsync().catch(() => {})
      await refreshBank()
      if (id != null) toast({ text: r.paired ? `${r.paired} already in Tally` : `${a.name} is ${t.acct.get(id)?.name}` })
    } catch (e) {
      toast({ text: errText(e, 'Could not save that.'), tone: 'error' })
    }
  })
  return (
    <View style={{ backgroundColor: c.panel, borderRadius: radius.panel, borderCurve: 'continuous', padding: space.l, gap: space.m }}>
      <View style={{ gap: 2 }}>
        <Txt variant="headline">Which account is {a.name}{a.mask ? ` ${a.mask}` : ''}?</Txt>
        <Txt variant="foot" tone="label2">{a.institution ?? 'A connected bank'}. Its new transactions show up here once you say.</Txt>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {options.map((x) => <Chip key={x.id} label={x.name} onPress={() => pick(x.id)} />)}
        <Chip label="Not one I track" onPress={() => pick(null)} />
      </View>
    </View>
  )
}
