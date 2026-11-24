// Activity: every entry, newest first, a day to a card. The Mail-style switcher narrows it to spending, income or
// moves between accounts; the search field in the title bar finds anything by name, note or amount.
import { useMemo, useState } from 'react'
import { ActivityIndicator, RefreshControl, SectionList, View } from 'react-native'
import { router, Stack } from 'expo-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { api, type CatType, type Txn } from '@/lib/api'
import { refreshBank } from '@/lib/bank'
import { dayLabel } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { useLedger } from '@/next/ledger'
import { radius, space, usePalette } from '@/next/theme'
import { LabTag } from '@/next/ui/LabTag'
import { Empty } from '@/next/ui/List'
import { Switcher, type SwitchOption } from '@/next/ui/Switcher'
import { Txt } from '@/next/ui/Txt'
import { TxnRow } from '@/next/ui/TxnRow'

type Filter = 'all' | 'Spending' | 'Money in' | 'Transfer'
const FILTERS: SwitchOption<Filter>[] = [
  { key: 'all', label: 'All', symbol: 'tray.fill', hue: 'blue' },
  { key: 'Spending', label: 'Spending', symbol: 'bag.fill', hue: 'pink' },
  { key: 'Money in', label: 'Income', symbol: 'arrow.down.circle.fill', hue: 'green' },
  { key: 'Transfer', label: 'Transfers', symbol: 'arrow.left.arrow.right', hue: 'indigo' },
]
const PAGE = 60

export default function Activity() {
  const p = usePalette()
  const L = useLedger()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const query = { q: q.trim() || undefined, type: filter === 'all' ? undefined : (filter as CatType) }
  const feed = useInfiniteQuery({
    queryKey: ['transactions', 'feed', query],
    queryFn: ({ pageParam }) => api.transactions({ ...query, sort: 'date', dir: 'desc', limit: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => { const n = pages.reduce((k, x) => k + x.items.length, 0); return n < last.total ? n : undefined },
  })
  const first = feed.data?.pages[0]
  const { today, typeOf } = L
  const sections = useMemo(() => {
    const out: { title: string; spent: number; data: Txn[] }[] = []
    let at = ''
    for (const t of feed.data?.pages.flatMap((x) => x.items) ?? []) {
      if (t.date !== at) { at = t.date; out.push({ title: dayLabel(t.date, today), spent: 0, data: [] }) }
      const s = out[out.length - 1]
      s.data.push(t)
      if (typeOf(t) === 'Spending') s.spent += t.amount
    }
    return out
  }, [feed.data, today, typeOf])

  const header = useMemo(() => (
    <Stack.Screen options={{
      headerLeft: () => <LabTag />,
      headerSearchBarOptions: { placeholder: 'Search', autoCapitalize: 'none', onChangeText: (e) => setQ(e.nativeEvent.text), onCancelButtonPress: () => setQ('') },
    }} />
  ), [])
  const toolbar = useMemo(() => (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button icon="plus" accessibilityLabel="Add a transaction" onPress={() => router.push('/next/add')} />
    </Stack.Toolbar>
  ), [])

  const refresh = async () => {
    setRefreshing(true)
    try { await api.bank.sync(0).catch(() => {}); await refreshBank() } finally { setRefreshing(false) }
  }

  return (
    <>
      {header}
      {toolbar}
      <SectionList
        sections={sections}
        keyExtractor={(t) => String(t.id)}
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: p.bg }}
        contentContainerStyle={{ paddingBottom: 120 }}
        stickySectionHeadersEnabled={false}
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        onEndReachedThreshold={0.6}
        onEndReached={() => { if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage() }}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: space.l, paddingTop: space.s, paddingBottom: space.s, gap: space.m }}>
            <Switcher options={FILTERS} value={filter} onChange={setFilter} />
            {query.q && first ? (
              <Txt v="subhead" tone="label2">{first.total === 1 ? '1 result' : `${first.total} results`}{first.total ? ` · ${formatCents(Math.abs(first.sum))}` : ''}</Txt>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.xl + space.xs, paddingTop: space.xl, paddingBottom: space.s }}>
            <Txt v="subhead" weight="600" tone="label2">{section.title}</Txt>
            {section.spent > 0 && <Txt v="subhead" tone="label2" num>{formatCents(section.spent)}</Txt>}
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const top = index === 0, bottom = index === section.data.length - 1
          return (
            <View style={{ marginHorizontal: space.l, overflow: 'hidden', backgroundColor: p.card, borderCurve: 'continuous',
              borderTopLeftRadius: top ? radius.card : 0, borderTopRightRadius: top ? radius.card : 0,
              borderBottomLeftRadius: bottom ? radius.card : 0, borderBottomRightRadius: bottom ? radius.card : 0 }}>
              {!top && <View style={{ height: 0.5, backgroundColor: p.separator, marginLeft: 70 }} />}
              <TxnRow t={item} />
            </View>
          )
        }}
        ListEmptyComponent={feed.isPending ? <ActivityIndicator style={{ marginTop: 60 }} /> : query.q
          ? <Empty symbol="magnifyingglass" title={`No Results for “${query.q}”`} body="Check the spelling or try a new search." />
          : <Empty symbol="list.bullet.rectangle" title="No Transactions" />}
        ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: space.xl }} /> : null}
      />
    </>
  )
}
