// Settings, Banks (Tally Lab): the banks connected through Plaid, which Tally account each of their accounts is,
// checking each against the bank, connecting another, repairing one whose sign-in lapsed, and disconnecting.
// Plaid's free plan allows ten connections for good (disconnecting doesn't give one back), so a broken connection is
// repaired in place, never added again.
import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Chip } from '@/components/Chip'
import { Hairline } from '@/components/Panel'
import { Group, Row } from '@/components/Row'
import { StateView } from '@/components/StateView'
import { Txt } from '@/components/Txt'
import { api, ApiError, type BankAccount, type BankConnected, type BankItem } from '@/lib/api'
import { openPlaidLink, refreshBank, useBank } from '@/lib/bank'
import { formatCents } from '@/lib/money'
import { useBusy } from '@/lib/nav'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { space } from '@/theme'

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.errors.join(' ') : e instanceof Error ? e.message : fallback)

/** "Connected. 214 transactions came across; Plaid Checking is Chase Checking." */
function connectedText(r: BankConnected, name: (id: number) => string | undefined, lead = 'Connected') {
  const n = Object.values(r.synced)[0]?.added ?? 0
  const m = r.matched.map((x) => `${x.bank_account} is ${name(x.account_id)}`).join(', ')
  return `${lead}. ${n} transactions came across${m ? `; ${m}` : ''}.`
}

const since = (iso: string | null) => {
  if (!iso) return 'Not yet'
  const m = (Date.now() - new Date(iso).getTime()) / 6e4
  return m < 2 ? 'Just now' : m < 90 ? `${Math.round(m)} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`
}

export function Banks() {
  const q = useBank()
  const t = useTally()
  const busy = useBusy()
  const nameOf = (id: number) => t.acct.get(id)?.name
  const [working, setWorking] = useState<string | null>(null)
  if (!q.data) return <StateView q={q} shape="list" />
  const s = q.data
  const run = (label: string, fn: () => Promise<void>) => busy(async () => {
    setWorking(label)
    try { await fn() } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      toast({ text: errText(e, `${label} failed.`), tone: 'error' })
    } finally { setWorking(null) }
  })
  const connect = (itemId?: number) => run(itemId ? 'Repair' : 'Connect', async () => {
    const { link_token } = await api.bank.linkToken(itemId)
    const pt = await openPlaidLink(link_token)
    if (!pt) return
    if (itemId) {
      await api.bank.sync() // update mode keeps the same connection; Plaid needs no exchange
    } else {
      toast({ text: connectedText(await api.bank.connect(pt), nameOf) })
    }
    await refreshBank()
  })
  const sandbox = () => run('Test bank', async () => {
    toast({ text: connectedText(await api.bank.sandbox(), nameOf, 'Test bank connected') })
    await refreshBank()
  })
  const sync = () => run('Sync', async () => {
    const r = await api.bank.sync()
    const failed = Object.values(r.synced).find((x) => x.error)
    toast(failed ? { text: failed.message ?? 'A bank could not be reached.', tone: 'error' } : { text: r.paired ? `Up to date. ${r.paired} matched entries already in Tally.` : 'Up to date' })
    await refreshBank()
  })
  return (
    <>
      {s.env === 'sandbox' && (
        <Txt variant="foot" tone="warn" style={{ paddingHorizontal: space.l }}>{"Plaid's sandbox: test banks with made-up transactions, not your real ones."}</Txt>
      )}
      <Group footer={s.waiting ? undefined : 'Tally checks the banks every few hours and when you open it, and shows anything new.'}>
        {s.waiting > 0 && <Row label="From the bank" value={String(s.waiting)} sf="tray.and.arrow.down" md="move_to_inbox" href="/bank" />}
        <Row label={working === 'Sync' ? 'Checking…' : 'Check the banks now'} sf="arrow.clockwise" md="refresh" chevron={false} onPress={sync} />
      </Group>
      {s.items.map((it) => <Item key={it.id} it={it} onRepair={() => connect(it.id)} run={run} />)}
      <Group footer="Plaid's free plan allows ten bank connections in all, and disconnecting one doesn't give it back. Connect each bank once; if one stops working, Repair it instead.">
        <Row label={working === 'Connect' ? 'Opening Plaid…' : 'Connect a bank'} sf="plus.circle" md="add_circle" chevron={false} onPress={() => connect()} />
        {s.env === 'sandbox' && <Row label={working === 'Test bank' ? 'Connecting…' : 'Add a test bank'} sub="Plaid's First Platypus Bank, without signing in" sf="testtube.2" md="science" chevron={false} onPress={sandbox} />}
      </Group>
    </>
  )
}

function Item({ it, onRepair, run }: { it: BankItem; onRepair: () => void; run: (label: string, fn: () => Promise<void>) => void }) {
  const [gone, setGone] = useState(false)
  if (gone) return null
  const disconnect = () => run('Disconnect', async () => {
    await api.bank.disconnect(it.id)
    setGone(true)
    await refreshBank()
    toast({ text: `${it.institution ?? 'Bank'} disconnected` })
  })
  return (
    <Group header={it.institution ?? 'Bank'} footer={it.error ? `The bank wants you to sign in again (${it.error}). Repair keeps the same connection.` : `Last checked ${since(it.synced_at).toLowerCase()}.`}>
      {it.accounts.map((a) => <AccountRow key={a.id} a={a} />)}
      {it.error && <Row label="Repair" sf="wrench.and.screwdriver" md="build" chevron={false} onPress={onRepair} />}
      <Row label="Disconnect" destructive chevron={false} onPress={disconnect} />
    </Group>
  )
}

/** A bank account: which Tally account it is (tap to choose), and a check against the bank once it's chosen. */
function AccountRow({ a }: { a: BankAccount }) {
  const t = useTally()
  const [open, setOpen] = useState(false)
  const mine = a.tally_account_id != null ? t.acct.get(a.tally_account_id) : undefined
  const pick = async (id: number | null) => {
    setOpen(false)
    try {
      const r = await api.bank.mapAccount(a.id, id)
      await refreshBank()
      if (r.paired) toast({ text: `${r.paired} already in Tally` })
    } catch (e) {
      toast({ text: errText(e, 'Could not save that.'), tone: 'error' })
    }
  }
  const label = `${a.name}${a.mask ? ` ${a.mask}` : ''}`
  return (
    <View>
      <Row label={label} sub={a.current != null ? `Bank balance ${formatCents(a.current)}` : undefined}
        value={mine ? mine.name : 'Not used'} onPress={() => setOpen((v) => !v)} />
      {open && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, paddingHorizontal: space.l, paddingBottom: space.m }}>
          <Chip label="Not used" selected={!mine} onPress={() => pick(null)} />
          {(t.b?.accounts ?? []).filter((x) => x.active).map((x) => <Chip key={x.id} label={x.name} selected={mine?.id === x.id} onPress={() => pick(x.id)} />)}
        </View>
      )}
      {mine && !open && <Hairline inset={space.l} />}
      {mine && !open && (
        <Row label="Check against the bank" sf="checklist" md="checklist" onPress={() => router.push({ pathname: '/bank-audit', params: { id: String(a.id) } })} />
      )}
    </View>
  )
}
