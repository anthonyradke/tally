// Which Tally account one bank account is: a list to choose from, the way Settings picks a value too long for its
// row. Only Tally accounts of a fitting kind are offered (a checking account mapped to a card flips every sign), and
// none another bank account already has.
import { useState } from 'react'
import { ActivityIndicator, ScrollView } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { api } from '@/lib/api'
import { refreshBank, useBank } from '@/lib/bank'
import { formatCents } from '@/lib/money'
import { useBusy, useCloseHere } from '@/design/busy'
import { kindsFor, why } from '@/design/checkin'
import { failure, success, tick } from '@/design/haptics'
import { useLedger } from '@/design/ledger'
import { bankName, KIND_LOOK } from '@/design/look'
import { space, usePalette } from '@/design/theme'
import { Empty, Row, Section } from '@/design/ui/List'
import { Logo } from '@/design/ui/Logo'
import { notify } from '@/design/ui/Notice'
import { SF } from '@/design/ui/SF'

const NONE = -1

export default function BankAccountChoice() {
  const p = usePalette()
  const L = useLedger()
  const q = useBank()
  const busy = useBusy()
  const closeHere = useCloseHere()
  const id = Number(useLocalSearchParams<{ id: string }>().id)
  const items = q.data?.items ?? []
  const it = items.find((i) => i.accounts.some((a) => a.id === id))
  const a = it?.accounts.find((x) => x.id === id)
  const asked = (q.data?.ask ?? []).some((x) => x.id === id)
  const mine = a?.tally_account_id != null ? L.acct.get(a.tally_account_id) : undefined
  const [picked, setPicked] = useState<number | null>(null)
  const shown = picked ?? (mine ? mine.id : asked ? null : NONE)

  if (!a || !it) {
    if (q.data === undefined && !q.isError) return <ActivityIndicator style={{ marginTop: 160 }} color={p.label2} />
    return <Empty symbol="building.columns" title="Account Not Found" body="It may have been disconnected." />
  }
  const taken = new Set(items.flatMap((i) => i.accounts).filter((x) => x.id !== id).map((x) => x.tally_account_id))
  const kinds = kindsFor(a.type, a.subtype)
  const options = (L.b?.accounts ?? []).filter((x) => x.id === mine?.id || (x.active && (!kinds.length || kinds.includes(x.kind)) && !taken.has(x.id)))

  const choose = (v: number) => {
    if (v === shown || busy.on) return
    tick()
    setPicked(v)
    busy.run(async () => {
      try {
        await api.bank.mapAccount(a.id, v === NONE ? null : v)
        success()
        await refreshBank()
        closeHere()
      } catch (e) {
        setPicked(null)
        failure()
        notify({ text: why(e, 'Couldn’t change it'), symbol: 'exclamationmark.triangle.fill', hue: 'orange' })
      }
    })
  }
  const check = (on: boolean) => (on ? <SF name="checkmark" size={17} color={p.tint} weight="semibold" /> : undefined)

  return (
    <>
      <Stack.Screen options={{ title: a.name }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }} contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 60 }}>
        <Section inset={64}>
          <Row leading={<Logo item={it.id} name={it.institution ?? undefined} letter size={36} />} title={a.name}
            subtitle={[it.institution, a.mask ? `••${a.mask}` : ''].filter(Boolean).join(' ')} value={a.current != null ? formatCents(a.current) : undefined} valueTone="label" />
        </Section>
        <Section title="Tally Account" compact inset={64} footer="New transactions from this account go here. Only accounts of the same type are listed.">
          {options.length ? options.map((x) => {
            const look = KIND_LOOK[x.kind]
            return (
              <Row key={x.id} leading={<Logo account={x.id} symbol={look.symbol} color={p[look.hue]} size={36} />} title={x.name}
                subtitle={bankName(x) ?? look.one} trailing={check(shown === x.id)} onPress={() => choose(x.id)} />
            )
          }) : <Row title="No Matching Accounts" disabled />}
        </Section>
        <Section footer="Tally leaves this account’s transactions out.">
          <Row title="Not Tracked" trailing={check(shown === NONE)} onPress={() => choose(NONE)} />
        </Section>
      </ScrollView>
    </>
  )
}
