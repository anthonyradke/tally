// The banks Tally reads through Plaid: each one's accounts and which Tally account each is, checking now, adding
// another, repairing a sign-in that lapsed, and disconnecting.
import { useState } from 'react'
import { Alert, ScrollView, View } from 'react-native'
import { api, ApiError, type BankItem } from '@/lib/api'
import { openPlaidLink, refreshBank, useBank } from '@/lib/bank'
import { formatCents } from '@/lib/money'
import { failure, success, warning } from '@/next/haptics'
import { useLedger } from '@/next/ledger'
import { space, usePalette } from '@/next/theme'
import { Button } from '@/next/ui/Button'
import { Empty, Row, Section } from '@/next/ui/List'
import { Logo } from '@/next/ui/Logo'
import { Choice } from '@/next/ui/native/Choice'
import { notify } from '@/next/ui/Notice'
import { Txt } from '@/next/ui/Txt'

const NONE = -1
const ago = (iso: string | null) => {
  if (!iso) return 'Not checked yet'
  const m = (Date.now() - new Date(iso).getTime()) / 6e4
  return m < 2 ? 'Updated just now' : m < 90 ? `Updated ${Math.round(m)} min ago` : m < 2880 ? `Updated ${Math.round(m / 60)} hr ago` : `Updated ${Math.round(m / 1440)} days ago`
}
const why = (e: unknown, f: string) => (e instanceof ApiError ? e.errors.join(' ') : e instanceof Error ? e.message : f)

function Bank({ it, taken }: { it: BankItem; taken: Set<number> }) {
  const L = useLedger()
  const repair = async () => {
    try { const { link_token } = await api.bank.linkToken(it.id); if (await openPlaidLink(link_token)) { await api.bank.sync(); success(); await refreshBank() } }
    catch (e) { failure(); notify({ text: why(e, 'Repair failed'), symbol: 'exclamationmark.triangle.fill', hue: 'orange' }) }
  }
  const disconnect = () => {
    warning()
    Alert.alert(`Disconnect ${it.institution ?? 'This Bank'}?`, 'New transactions will stop coming in. This connection can’t be restored.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: async () => { try { await api.bank.disconnect(it.id); await refreshBank() } catch (e) { notify({ text: why(e, 'Failed'), hue: 'orange' }) } } },
    ])
  }
  return (
    <Section inset={64} footer={it.error ? 'Sign in again to keep this bank up to date.' : ago(it.synced_at)}>
      <Row leading={<Logo item={it.id} name={it.institution ?? undefined} letter size={36} />} title={it.institution ?? 'Bank'}
        subtitle={`${it.accounts.length} ${it.accounts.length === 1 ? 'account' : 'accounts'}`} />
      {it.accounts.map((a) => {
        const mine = a.tally_account_id != null ? L.acct.get(a.tally_account_id) : undefined
        const options: [number, string][] = [...(L.b?.accounts ?? []).filter((x) => x.active && (!taken.has(x.id) || x.id === mine?.id)).map((x) => [x.id, x.name] as [number, string]), [NONE, 'Not Tracked']]
        return (
          <Row key={a.id} leading={<View style={{ width: 36 }} />} title={`${a.name}${a.mask ? ` ••${a.mask}` : ''}`}
            subtitle={a.current != null ? formatCents(a.current) : undefined}
            trailing={<Choice options={options} value={mine ? mine.id : NONE} onChange={async (v) => {
              try { await api.bank.mapAccount(a.id, v === NONE ? null : v); success(); await refreshBank() } catch (e) { failure(); notify({ text: why(e, 'Failed'), hue: 'orange' }) }
            }} />} />
        )
      })}
      {it.error ? <Row title="Sign In Again" tint onPress={repair} /> : null}
      <Row title="Disconnect" destructive onPress={disconnect} />
    </Section>
  )
}

export default function Banks() {
  const p = usePalette()
  const q = useBank()
  const [busy, setBusy] = useState<string | null>(null)
  const s = q.data
  const taken = new Set((s?.items ?? []).flatMap((i) => i.accounts.map((a) => a.tally_account_id)).filter((x): x is number => x != null))
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    try { await fn() } catch (e) { failure(); notify({ text: why(e, `${label} failed`), symbol: 'exclamationmark.triangle.fill', hue: 'orange' }) } finally { setBusy(null) }
  }
  const connect = () => run('Connect', async () => {
    const { link_token } = await api.bank.linkToken()
    const pt = await openPlaidLink(link_token)
    if (!pt) return
    const r = await api.bank.connect(pt)
    success(); await refreshBank()
    notify({ text: `Connected · ${Object.values(r.synced)[0]?.added ?? 0} transactions`, symbol: 'checkmark.circle.fill' })
  })
  const sync = () => run('Check', async () => {
    const r = await api.bank.sync()
    success(); await refreshBank()
    notify({ text: r.added ? `${r.added} new` : 'Up to date', symbol: 'checkmark.circle.fill' })
  })
  if (!s) return q.isPending ? null : <Empty symbol="building.columns" title="No Bank Connections" body="This server doesn’t connect to banks." />
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }} contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 60 }}>
      {s.env === 'sandbox' && <Txt v="footnote" tone="orange" center>Plaid sandbox: test banks with made-up transactions.</Txt>}
      {s.items.map((it) => <Bank key={it.id} it={it} taken={taken} />)}
      <View style={{ gap: space.m }}>
        <Button label="Add a Bank" symbol="plus" onPress={connect} busy={busy === 'Connect'} />
        {s.env === 'sandbox' && <Button label="Add a Test Bank" kind="tinted" onPress={() => run('Test', async () => { await api.bank.sandbox(); success(); await refreshBank() })} busy={busy === 'Test'} />}
        <Button label="Check Now" kind="plain" onPress={sync} busy={busy === 'Check'} />
      </View>
    </ScrollView>
  )
}

