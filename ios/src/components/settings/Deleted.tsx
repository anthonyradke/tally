// Settings → Recently deleted: entries deleted in the last 30 days (the server keeps them), each with Put back, for
// when the Undo toast had gone or the app was closed. Rows removed together (a bulk delete, a split) are grouped
// (lib/deleted.ts) and can go back all at once.
import { View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Group, Row } from '@/components/Row'
import { StateView } from '@/components/StateView'
import { Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { openEntry } from '@/lib/actions'
import { write } from '@/lib/admin'
import { api, type DeletedTxn, type Txn } from '@/lib/api'
import { asEntry, byDelete, skippedFrom } from '@/lib/deleted'
import { dayLabel, toISO } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { markFresh } from '@/lib/motion'
import { useBusy } from '@/lib/nav'
import { play } from '@/lib/sound'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { space } from '@/theme'

export function Deleted() {
  const t = useTally()
  const q = useQuery({ queryKey: ['deleted'], queryFn: api.deleted })
  const busy = useBusy()
  if (!q.data) return <StateView q={q} shape="list" />
  if (!q.data.length) {
    return (
      <View style={{ gap: space.xs, paddingHorizontal: space.xs }}>
        <Txt variant="headline">Nothing to put back</Txt>
        <Txt variant="callout" tone="label2">Deleted entries wait here for 30 days.</Txt>
      </View>
    )
  }
  const name = (x: Txn) => x.what || t.catOf(x).name
  const where = (x: Txn) => [x.from_id, x.to_id].filter((v): v is number => v != null).map((id) => t.acct.get(id)?.name ?? '').filter(Boolean).join(' → ')
  const putBack = (rows: DeletedTxn[]) => busy(async () => {
    const entries = rows.map(asEntry)
    if (!(await write(() => api.restore(entries)))) return
    play('undo')
    markFresh(entries.map((x) => x.id)) // they unfold back into their lists
    const one = entries.length === 1 ? entries[0] : null
    const unskip = rows.length === 1 && rows[0].skipped_from && one
    toast({
      text: unskip ? (one.date > t.today ? `${name(one)} will post ${dayLabel(one.date, t.today) === 'Tomorrow' ? 'tomorrow' : `on ${dayLabel(one.date, t.today)}`}` : `${name(one)} posted again`)
        : one ? `Put back ${name(one)} ${formatCents(one.amount)}` : `Put back ${entries.length} entries`,
      action: one ? { label: 'Show', run: () => openEntry(one.id) } : undefined,
    })
    q.refetch()
  })
  const groups = byDelete(q.data)
  return (
    <>
      {groups.map((g) => {
        const when = dayLabel(toISO(new Date(g[0].deleted_at)), t.today).toLowerCase()
        const skip = skippedFrom(g)
        return (
          <Group key={`${g[0].deleted_at}:${g[0].id}`} header={skip ? `Skipped from ${skip} (recurring)` : g.length > 1 ? `${g.length} deleted together ${when}` : undefined}>
            {[
              ...g.map((x) => (
                <Row key={x.id} label={name(x)} chevron={false}
                  sub={`${x.skipped_from && !skip ? `Skipped from ${x.skipped_from}, ` : ''}${formatCents(x.amount)}, ${t.catOf(x).name}${where(x) ? ` on ${where(x)}` : ''}, ${dayLabel(x.date, t.today)}${g.length > 1 ? '' : `, ${x.skipped_from ? 'skipped' : 'deleted'} ${when}`}`}
                  trailing={<Tap feedback="opacity" hitSlop={8} onPress={() => putBack([x])} accessibilityLabel={x.skipped_from ? `Unskip ${name(x)}: post it again` : `Put back ${name(x)}`}>
                    <Txt variant="callout" style={{ fontWeight: '600' }}>{x.skipped_from ? 'Unskip' : 'Put back'}</Txt></Tap>} />
              )),
              ...(g.length > 1 ? [<Row key="all" label={`Put back all ${g.length}`} sf="arrow.uturn.backward" md="undo" chevron={false} onPress={() => putBack(g)} />] : []),
            ]}
          </Group>
        )
      })}
      <Txt variant="foot" tone="label2" style={{ paddingHorizontal: space.l, lineHeight: 16 }}>{"Kept for 30 days after they're deleted, then gone for good. Putting one back keeps its receipt and its place. A skipped recurring date waits here too: Unskip posts it on its day again."}</Txt>
    </>
  )
}
