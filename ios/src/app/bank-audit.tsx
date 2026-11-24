// One account checked against its bank: the bank's balance next to Tally's, the bank rows Tally doesn't have, and the
// entries in Tally the bank never showed, since the bank's history starts (or Tally does, if later). Missing rows open
// in the inbox's sheet to add; extra entries open in the editor.
import { ScrollView, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Money } from '@/components/Money'
import { Panel } from '@/components/Panel'
import { Group, Row } from '@/components/Row'
import { StateView } from '@/components/StateView'
import { Txt } from '@/components/Txt'
import { api } from '@/lib/api'
import { dayLabel } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { close } from '@/lib/nav'
import { queryClient } from '@/lib/data'
import { space, useTheme } from '@/theme'

export default function BankAudit() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { c } = useTheme()
  const q = useQuery({ queryKey: ['bank', 'audit', Number(id)], queryFn: () => api.bank.audit(Number(id)) })
  const a = q.data
  return (
    <>
      <Stack.Screen options={{ title: a ? a.bank_account : 'Check' }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Close" onPress={() => close()} />
      </Stack.Toolbar>
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 80 }}>
        {!a ? <StateView q={q} shape="list" /> : (
          <>
            <Panel style={{ gap: space.s }}>
              <Txt variant="sub" tone="label2">{a.gap === 0 ? 'Tally matches the bank' : a.gap == null ? 'Balance' : 'Tally and the bank differ by'}</Txt>
              {a.gap != null && a.gap !== 0 && <Money variant="title" cents={Math.abs(a.gap)} />}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt variant="callout" tone="label2">Bank</Txt>
                <Txt variant="callout" num>{a.bank_balance != null ? formatCents(a.bank_balance) : 'Unknown'}</Txt>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt variant="callout" tone="label2">Tally</Txt>
                <Txt variant="callout" num>{a.tally_balance != null ? formatCents(a.tally_balance) : 'Unknown'}</Txt>
              </View>
              {a.pending !== 0 && <Txt variant="foot" tone="label2">{formatCents(Math.abs(a.pending))} is still pending at the bank, which can explain part of a gap.</Txt>}
              <Txt variant="foot" tone="label2">{a.matched} entries match the bank since {dayLabel(a.first)}.</Txt>
            </Panel>
            <Group header={a.missing.length ? `At the bank, not in Tally (${a.missing.length})` : 'At the bank, not in Tally'}
              footer={a.missing.length ? 'Tap one to add it.' : 'Nothing missing.'}>
              {a.missing.map((m) => (
                <Row key={m.id} label={m.merchant ?? m.raw} sub={dayLabel(m.date)} value={formatCents(Math.abs(m.amount))}
                  onPress={async () => {
                    await queryClient.fetchQuery({ queryKey: ['bank', 'inbox'], queryFn: api.bank.inbox, staleTime: 5_000 })
                    router.push({ pathname: '/bank-item', params: { id: String(m.id) } })
                  }} />
              ))}
            </Group>
            <Group header={a.extra.length ? `In Tally, not at the bank (${a.extra.length})` : 'In Tally, not at the bank'}
              footer={a.extra.length ? 'Each could be a typo in the amount, a doubled entry, or one on the wrong account. Tap to open it.' : 'Every entry is on the bank too.'}>
              {a.extra.map((x) => (
                <Row key={x.id} label={x.what} sub={dayLabel(x.date)} value={formatCents(Math.abs(x.amount))}
                  onPress={() => router.push({ pathname: '/entry', params: { id: String(x.id) } })} />
              ))}
            </Group>
          </>
        )}
      </ScrollView>
    </>
  )
}
