// One account's or one category's entries under its page's own header: posted entries newest first, read a page at a
// time as you scroll, with the scheduled ones folded into a row above them and dimmed when opened, and what's still
// pending at the bank (`pending`) dimmed above those.
import { useState, type ReactElement } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native'
import type { Account, PendingTxn, Txn, TxnQuery } from '@/lib/api'
import { useTransactions } from '@/lib/data'
import { addDays } from '@/lib/dates'
import { tick } from '../haptics'
import { usePaged, useRefresh } from '../feed'
import { loadOf, useLedger } from '../ledger'
import { radius, space, usePalette } from '../theme'
import { Empty, Row, Section, Tile } from './List'
import { Blocked } from './LoadState'
import { PendingRow } from './PendingRow'
import { SF } from './SF'
import { Txt } from './Txt'
import { TxnRow } from './TxnRow'

/** `scheduled`: whether entries still to come belong to this list (not for a month in the past). */
export function EntryList({ query, header, account, title = 'Transactions', aside, scheduled = true, pending }: {
  query: TxnQuery; header: ReactElement; account?: Account; title?: string; aside?: string; scheduled?: boolean; pending?: PendingTxn[]
}) {
  const p = usePalette()
  const L = useLedger()
  const { refreshing, refresh } = useRefresh()
  const end = query.end && query.end < L.today ? query.end : L.today
  const posted = usePaged({ ...query, end, sort: 'date', dir: 'desc' }, { keep: true })
  const later = useTransactions({ ...query, start: addDays(L.today, 1), sort: 'date', dir: 'asc', limit: 50 }, scheduled)
  const soon = scheduled ? later.data?.items ?? [] : []
  const [open, setOpen] = useState(false)
  const state = loadOf(posted.q)

  const top = (
    <View style={{ gap: space.xxl, paddingBottom: space.s }}>
      {header}
      {pending?.length ? (
        <Section title="Pending" inset={70}>
          {pending.map((r) => <PendingRow key={r.id} r={r} account={account} />)}
        </Section>
      ) : null}
      {soon.length > 0 && (
        <Section inset={70}>
          {[
            <Row key="head" leading={<Tile symbol="calendar" color={p.gray} size={42} />} title="Scheduled" value={String(later.data?.total ?? soon.length)}
              trailing={<SF name={open ? 'chevron.up' : 'chevron.down'} size={13} color={p.label3} weight="semibold" />}
              onPress={() => { tick(); setOpen((o) => !o) }} />,
            ...(open ? soon.map((t) => <TxnRow key={t.id} t={t} showDate account={account} />) : []),
          ]}
        </Section>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space.xs }}>
        <Txt v="title3" weight="700">{title}</Txt>
        {aside ? <Txt v="body" tone="label2">{aside}</Txt> : null}
      </View>
    </View>
  )
  const renderItem = ({ item, index }: { item: Txn; index: number }) => {
    const first = index === 0, last = index === posted.rows.length - 1
    return (
      <View style={{ overflow: 'hidden', backgroundColor: p.card, borderCurve: 'continuous',
        borderTopLeftRadius: first ? radius.card : 0, borderTopRightRadius: first ? radius.card : 0,
        borderBottomLeftRadius: last ? radius.card : 0, borderBottomRightRadius: last ? radius.card : 0 }}>
        {!first && <View style={{ height: 0.5, backgroundColor: p.separator, marginLeft: 70 }} />}
        <TxnRow t={item} showDate account={account} />
      </View>
    )
  }
  return (
    <FlatList
      data={posted.rows}
      keyExtractor={(t) => String(t.id)}
      renderItem={renderItem}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={{ padding: space.l, paddingBottom: 120 }}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={9}
      removeClippedSubviews={process.env.EXPO_OS === 'ios'}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      onEndReachedThreshold={0.6}
      onEndReached={posted.more}
      ListHeaderComponent={top}
      ListEmptyComponent={state.kind !== 'ready' ? <Blocked kind={state.kind} onRetry={posted.q.refetch} /> : <Empty symbol="list.bullet.rectangle" title="No Transactions" />}
      ListFooterComponent={posted.q.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: space.xl }} /> : null}
    />
  )
}
