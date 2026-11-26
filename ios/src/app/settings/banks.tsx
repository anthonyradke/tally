// The banks Tally reads through Plaid: each one's accounts and which Tally account each is, checking now, adding
// another, repairing a sign-in that lapsed, and disconnecting.
import { useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { api, type BankAccount, type BankItem } from '@/lib/api'
import { linkBanks, openPlaidLink, refreshBank, useBank } from '@/lib/bank'
import { formatCents } from '@/lib/money'
import { useBusy } from '@/design/busy'
import { checkSummary, why } from '@/design/checkin'
import { failure, success, warning } from '@/design/haptics'
import { useLedger } from '@/design/ledger'
import { space, usePalette } from '@/design/theme'
import { Button } from '@/design/ui/Button'
import { Empty, Row, Section, Tile } from '@/design/ui/List'
import { Logo } from '@/design/ui/Logo'
import { notify } from '@/design/ui/Notice'
import { Press } from '@/design/ui/Press'
import { SF } from '@/design/ui/SF'
import { Txt } from '@/design/ui/Txt'

const oops = { symbol: 'exclamationmark.triangle.fill', hue: 'orange' } as const
const ago = (iso: string | null) => {
  if (!iso) return 'Not checked yet'
  const m = (Date.now() - new Date(iso).getTime()) / 6e4
  return m < 2 ? 'Updated just now' : m < 90 ? `Updated ${Math.round(m)} min ago` : m < 2880 ? `Updated ${Math.round(m / 60)} hr ago` : `Updated ${Math.round(m / 1440)} days ago`
}

/** One bank account on two lines, so neither its own name nor the Tally account it feeds is ever squeezed out: name,
 *  last four and balance on top, the Tally account under them (or "Choose an Account" while nobody has answered).
 *  Tapping it opens the list to choose from (bank-account/[id]), as Settings does with a value too long for its row. */
function Mapping({ a, asked }: { a: BankAccount; asked: boolean }) {
  const L = useLedger()
  const p = usePalette()
  const mine = a.tally_account_id != null ? L.acct.get(a.tally_account_id) : undefined
  const into = mine ? mine.name : asked ? 'Choose an Account' : 'Not Tracked'
  const balance = a.current != null ? formatCents(a.current) : ''
  return (
    <Press feel="highlight" haptic={false} onPress={() => router.push({ pathname: '/settings/bank-account/[id]', params: { id: String(a.id) } })}
      accessibilityLabel={[a.name, a.mask ? `ending ${a.mask}` : '', balance, mine ? `in Tally as ${mine.name}` : into].filter(Boolean).join(', ')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingLeft: 64, paddingRight: space.l, paddingVertical: 10, minHeight: 64 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
            <Txt v="body" numberOfLines={1} style={{ flexShrink: 1 }}>{a.name}</Txt>
            {a.mask ? <Txt v="body" tone="label2" num style={{ flexShrink: 0 }}>••{a.mask}</Txt> : null}
            <View style={{ flexGrow: 1 }} />
            {balance ? <Txt v="body" tone="label2" num style={{ flexShrink: 0 }}>{balance}</Txt> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <SF name="arrow.turn.down.right" size={12} color={p.label3} weight="semibold" />
            <Txt v="subhead" color={mine ? p.label2 : asked ? p.tint : p.label3} numberOfLines={1} style={{ flexShrink: 1 }}>{into}</Txt>
          </View>
        </View>
        <SF name="chevron.right" size={13} color={p.label3} weight="semibold" />
      </View>
    </Press>
  )
}

function Bank({ it, asked }: { it: BankItem; asked: Set<number> }) {
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
      {it.accounts.map((a) => <Mapping key={a.id} a={a} asked={asked.has(a.id)} />)}
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
      {/* First on the page, so it's found without scrolling past every bank. */}
      <Section inset={62}>
        <Row leading={<Tile symbol="plus" color={p.tint} size={30} />} title={busy === 'Connect' ? 'Connecting…' : 'Add a Bank'} tint
          onPress={connect} />
        {s.env === 'sandbox' && (
          <Row leading={<Tile symbol="testtube.2" color={p.orange} size={30} />} title={busy === 'Test' ? 'Adding…' : 'Add a Test Bank'} tint
            onPress={() => run('Test', async () => { await api.bank.sandbox(); success(); await refreshBank() })} />
        )}
        {s.items.length > 0 && (
          <Row leading={<Tile symbol="arrow.clockwise" color={p.blue} size={30} />} title={busy === 'Check' ? 'Checking…' : 'Check Now'} tint
            onPress={sync} />
        )}
      </Section>
      {s.items.map((it) => <Bank key={it.id} it={it} asked={asked} />)}
    </ScrollView>
  )
}

