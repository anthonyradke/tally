// Accounts: every account in the ledger by kind, each with a switch to show or hide it (the server's `active`). A
// hidden account drops out of the Wallet, the lists and the pickers but still counts toward net worth and balances;
// one that still holds money stays under Hidden on Accounts. Tap a name to rename it.
import { useMemo } from 'react'
import { Alert, ScrollView, Switch } from 'react-native'
import type { Account } from '@/lib/api'
import { byKind, saveAccount, type AccountChange } from '@/lib/accounts'
import { formatCents } from '@/lib/money'
import { why } from '@/design/checkin'
import { failure } from '@/design/haptics'
import { pastMonths, useLedger } from '@/design/ledger'
import { KIND_LOOK } from '@/design/look'
import { space, usePalette } from '@/design/theme'
import { Empty, Row, Section } from '@/design/ui/List'
import { loadGate } from '@/design/ui/LoadState'
import { Logo } from '@/design/ui/Logo'
import { notify } from '@/design/ui/Notice'

const FOOTER = 'Hidden accounts still count toward net worth and balances. One that still holds money stays under Hidden on Accounts.'

function save(a: Account, change: AccountChange, failed: string) {
  saveAccount(a, change).catch((e) => {
    failure()
    notify({ text: why(e, failed), symbol: 'exclamationmark.triangle.fill', hue: 'orange' })
  })
}

function rename(a: Account) {
  if (process.env.EXPO_OS !== 'ios') return // Alert.prompt is iOS's own
  Alert.prompt('Rename Account', undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Save', isPreferred: true, onPress: (v?: string) => {
      const name = v?.trim()
      if (name && name !== a.name) save(a, { name }, `Couldn’t rename ${a.name}`)
    } },
  ], 'plain-text', a.name)
}

function AccountRow({ a, balance }: { a: Account; balance: number }) {
  const p = usePalette()
  const look = KIND_LOOK[a.kind]
  return (
    <Row leading={<Logo account={a.id} symbol={look.symbol} color={p[look.hue]} size={30} />} title={a.name}
      subtitle={formatCents(balance)} onPress={process.env.EXPO_OS === 'ios' ? () => rename(a) : undefined}
      trailing={
        <Switch value={a.active} trackColor={{ true: p.tint, false: p.fill }} accessibilityLabel={`Show ${a.name}`}
          onValueChange={(on) => save(a, { active: on }, `Couldn’t ${on ? 'show' : 'hide'} ${a.name}`)} />
      } />
  )
}

export default function AccountsSettings() {
  const p = usePalette()
  const L = useLedger()
  const gate = loadGate(L.q)
  const months = useMemo(() => pastMonths(L.b, L.today), [L.b, L.today])
  const now = months[months.length - 1]
  const groups = byKind(L.b?.accounts ?? [])
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }} contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 60 }}>
      {gate.block ?? (!groups.length ? <Empty symbol="building.columns" title="No Accounts" /> : (
        <>
          {gate.note}
          {groups.map(([kind, list], i) => (
            <Section key={kind} title={KIND_LOOK[kind].title} compact inset={58} footer={i === groups.length - 1 ? FOOTER : undefined}>
              {list.map((a) => <AccountRow key={a.id} a={a} balance={now?.balances[a.id] ?? 0} />)}
            </Section>
          ))}
        </>
      ))}
    </ScrollView>
  )
}
