// The banks Tally reads through Plaid: each one's accounts and which Tally account each is, checking now, adding
// another, repairing a sign-in that lapsed, and disconnecting.
import { useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { api, type BankAccount, type BankItem } from '@/lib/api'
import { linkBanks, openPlaidLink, refreshBank, useBank } from '@/lib/bank'
import { formatCents } from '@/lib/money'
import { useBusy } from '@/design/busy'
import { checkSummary, kindsFor, why } from '@/design/checkin'
import { failure, success, warning } from '@/design/haptics'
import { useLedger } from '@/design/ledger'
import { space, usePalette } from '@/design/theme'
import { Button } from '@/design/ui/Button'
import { Empty, Row, Section } from '@/design/ui/List'
import { Logo } from '@/design/ui/Logo'
import { Choice } from '@/design/ui/native/Choice'
import { notify } from '@/design/ui/Notice'
import { Txt } from '@/design/ui/Txt'

const NONE = -1
const oops = { symbol: 'exclamationmark.triangle.fill', hue: 'orange' } as const
const ago = (iso: string | null) => {
  if (!iso) return 'Not checked yet'
  const m = (Date.now() - new Date(iso).getTime()) / 6e4
  return m < 2 ? 'Updated just now' : m < 90 ? `Updated ${Math.round(m)} min ago` : m < 2880 ? `Updated ${Math.round(m / 60)} hr ago` : `Updated ${Math.round(m / 1440)} days ago`
}

/** One bank account and which Tally account it is. Only Tally accounts of a fitting kind are offered (a checking
 *  account mapped to a card flips every sign); one nobody has answered yet shows "Choose", not "Not Tracked". */
function Mapping({ a, taken, asked }: { a: BankAccount; taken: Set<number>; asked: boolean }) {
  const L = useLedger()
  const p = usePalette()
  const busy = useBusy()
  const mine = a.tally_account_id != null ? L.acct.get(a.tally_account_id) : undefined
  const kinds = kindsFor(a.type, a.subtype)
  const options: [number, string][] = [...(L.b?.accounts ?? [])
    .filter((x) => x.id === mine?.id || (x.active && (!kinds.length || kinds.includes(x.kind)) && !taken.has(x.id)))
    .map((x) => [x.id, x.name] as [number, string]), [NONE, 'Not Tracked']]
  const place = (v: number) => busy.run(async () => {
    try { await api.bank.mapAccount(a.id, v === NONE ? null : v); success(); await refreshBank() }
    catch (e) { failure(); notify({ text: why(e, "Couldn't change it"), ...oops }) }
  })
  return (
    <Row leading={<View style={{ width: 36 }} />} title={`${a.name}${a.mask ? ` ••${a.mask}` : ''}`}
      subtitle={a.current != null ? formatCents(a.current) : undefined}
      trailing={busy.on ? <ActivityIndicator color={p.label2} /> : <Choice options={options} value={mine ? mine.id : asked ? null : NONE} onChange={place} none="Choose" />} />
  )
}

function Bank({ it, taken, asked }: { it: BankItem; taken: Set<number>; asked: Set<number> }) {
  const repairing = useBusy()
  const name = it.institution ?? 'This Bank'
  const repair = () => repairing.run(async () => {
    try {
      const { link_token } = await api.bank.linkToken(it.id)
      if (!(await openPlaidLink(link_token))) return
      await api.bank.repaired(it.id).catch(() => {}) // the sign-in is fixed either way; the next check brings the rows
      success()
      await refreshBank()
      notify({ text: `${name} Signed In`, symbol: 'checkmark.circle.fill' })
    } catch (e) { failure(); notify({ text: why(e, 'Couldn’t sign in'), ...oops }) }
  })
  const disconnect = () => {
    warning()
    // The one confirm in Tally: Plaid can't take a disconnect back, so there's no Undo to offer.
    Alert.alert(`Disconnect ${name}?`, 'New transactions will stop coming in. This connection can’t be restored.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: async () => {
        try {
          await api.bank.disconnect(it.id)
          success()
          await refreshBank()
          notify({ text: `${name} Disconnected`, symbol: 'checkmark.circle.fill', hue: 'gray' })
        } catch (e) { failure(); notify({ text: why(e, 'Couldn’t disconnect'), ...oops }) }
      } },
    ])
  }
  return (
    <Section inset={64} footer={it.error ? 'Sign in again to keep this bank up to date.' : ago(it.synced_at)}>
      <Row leading={<Logo item={it.id} name={it.institution ?? undefined} letter size={36} />} title={it.institution ?? 'Bank'}
        subtitle={`${it.accounts.length} ${it.accounts.length === 1 ? 'account' : 'accounts'}`} />
      {it.accounts.map((a) => <Mapping key={a.id} a={a} taken={taken} asked={asked.has(a.id)} />)}
      {it.error ? <Row title={repairing.on ? 'Signing In…' : 'Sign In Again'} tint onPress={repair} disabled={repairing.on} /> : null}
      <Row title="Disconnect" destructive onPress={disconnect} />
    </Section>
  )
}

export default function Banks() {
  const p = usePalette()
  const q = useBank()
  const [busy, setBusy] = useState<string | null>(null)
  const guard = useBusy()
  const s = q.data
  const taken = new Set((s?.items ?? []).flatMap((i) => i.accounts.map((a) => a.tally_account_id)).filter((x): x is number => x != null))
  const asked = new Set((s?.ask ?? []).map((a) => a.id))
  const run = (label: string, fn: () => Promise<void>) => guard.run(async () => {
    setBusy(label)
    try { await fn() } catch (e) { failure(); notify({ text: why(e, `${label} failed`), ...oops }) } finally { setBusy(null) }
  })
  const connect = () => run('Connect', async () => {
    const r = await linkBanks()
    await refreshBank()
    if (!r) return
    success()
    const rows = Object.values(r.synced).reduce<number>((n, x) => n + (x.added ?? 0), 0)
    notify({ text: `${r.items.length === 1 ? 'Bank' : `${r.items.length} banks`} connected · ${rows} transactions`, symbol: 'checkmark.circle.fill' })
  })
  const sync = () => run('Check', async () => {
    const r = await api.bank.sync()
    await refreshBank()
    const now = (await q.refetch()).data
    const said = checkSummary(r.synced, now?.items ?? s?.items ?? [], now?.waiting ?? 0, r.added ?? 0)
    if (said.kind === 'failed') { warning(); notify({ text: said.text, ...oops }) }
    else if (said.kind === 'review') { success(); notify({ text: said.text, symbol: 'tray.full.fill', hue: 'tint', action: { label: 'Review', run: () => router.push('/check-in') } }) }
    else { success(); notify({ text: said.text, symbol: 'checkmark.circle.fill' }) }
  })
  if (s === undefined) {
    if (!q.isError) return <ActivityIndicator style={{ marginTop: 160 }} color={p.label2} />
    return (
      <Empty symbol="icloud.slash" title="Can’t Reach Tally" body={why(q.error, 'Check your connection and try again.')}>
        <Button label="Try Again" kind="tinted" onPress={() => q.refetch()} style={{ marginTop: space.l, alignSelf: 'stretch' }} />
      </Empty>
    )
  }
  if (s === null) return <Empty symbol="building.columns" title="No Bank Connections" body="This server doesn’t connect to banks." />
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }} contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 60 }}>
      {s.env === 'sandbox' && <Txt v="footnote" tone="orange" center>Plaid sandbox: test banks with made-up transactions.</Txt>}
      {s.items.map((it) => <Bank key={it.id} it={it} taken={taken} asked={asked} />)}
      <View style={{ gap: space.m }}>
        <Button label="Add a Bank" symbol="plus" onPress={connect} busy={busy === 'Connect'} />
        {s.env === 'sandbox' && <Button label="Add a Test Bank" kind="tinted" onPress={() => run('Test', async () => { await api.bank.sandbox(); success(); await refreshBank() })} busy={busy === 'Test'} />}
        <Button label="Check Now" kind="plain" onPress={sync} busy={busy === 'Check'} />
      </View>
    </ScrollView>
  )
}

