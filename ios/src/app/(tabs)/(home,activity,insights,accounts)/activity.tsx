// Activity: every entry, newest first, a day to a card. The Mail-style switcher narrows it to spending, income or
// moves between accounts (transfers, saving and loan payments); the search field in the title bar finds anything by
// name, note or amount.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, RefreshControl, SectionList, View } from 'react-native'
import { router, Stack } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import type { Txn, TxnQuery } from '@/lib/api'
import { dayLabel } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { pagedQuery, usePaged, useRefresh } from '@/design/feed'
import { byDay, loadOf, searchLine, useLedger, type Filter } from '@/design/ledger'
import { radius, space, usePalette } from '@/design/theme'
import { Empty } from '@/design/ui/List'
import { Blocked, loadGate } from '@/design/ui/LoadState'
import { Switcher, type SwitchOption } from '@/design/ui/Switcher'
import { Txt } from '@/design/ui/Txt'
import { TxnRow } from '@/design/ui/TxnRow'

const FILTERS: SwitchOption<Filter>[] = [
  { key: 'all', label: 'All', symbol: 'tray.fill', hue: 'tint' },
  { key: 'Spending', label: 'Spending', symbol: 'bag.fill', hue: 'pink' },
  { key: 'Money in', label: 'Income', symbol: 'arrow.down.circle.fill', hue: 'green' },
  { key: 'Transfer', label: 'Transfers', symbol: 'arrow.left.arrow.right', hue: 'indigo' },
]
const TYPES: Record<Filter, TxnQuery['type']> = { all: undefined, Spending: 'Spending', 'Money in': 'Money in', Transfer: 'Transfer,Loan,Saving' }
// Newest first, and a search's exact-amount matches kept in date order, so a day never splits in two.
const feedQuery = (q: string | undefined, filter: Filter): TxnQuery => ({ q, type: TYPES[filter], sort: 'date', dir: 'desc', exact_first: 0 })

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id) }, [value, ms])
  return v
}

export default function Activity() {
  const p = usePalette()
  const L = useLedger()
  const gate = loadGate(L.q)
  const [filter, setFilter] = useState<Filter>('all')
  const [typed, setTyped] = useState('')
  const q = useDebounced(typed.trim(), 250) || undefined
  const { refreshing, refresh } = useRefresh()
  const feed = usePaged(feedQuery(q, filter), { keep: true })
  // Every filter's first page is fetched up front, so switching is instant instead of waiting on the server.
  const client = useQueryClient()
  useEffect(() => {
    for (const f of FILTERS) client.prefetchInfiniteQuery(pagedQuery(feedQuery(undefined, f.key))).catch(() => {})
  }, [client])
  const { today, typeOf } = L
  const sections = useMemo(() => byDay(feed.rows, (t) => typeOf(t) === 'Spending')
    .map((d) => ({ title: dayLabel(d.date, today), spent: d.spent, data: d.data })), [feed.rows, today, typeOf])

  // A new filter starts at the top of its list, as Mail does.
  const list = useRef<SectionList<Txn, { title: string; spent: number }>>(null)
  const top = useRef<number | null>(null)
  const y = useRef(0)
  const choose = (f: Filter) => {
    setFilter(f)
    if (top.current !== null && y.current > top.current + 4) list.current?.getScrollResponder()?.scrollTo({ y: top.current, animated: false })
  }

  const header = useMemo(() => (
    <Stack.Screen options={{
      headerSearchBarOptions: { placeholder: 'Search', autoCapitalize: 'none', onChangeText: (e) => setTyped(e.nativeEvent.text), onCancelButtonPress: () => setTyped('') },
    }} />
  ), [])
  const toolbar = useMemo(() => (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button icon="plus" accessibilityLabel="Add a transaction" onPress={() => router.push('/add')} />
    </Stack.Toolbar>
  ), [])
  const line = q && feed.first ? searchLine(feed.first, filter) : null
  const failed = loadOf(feed.q)

  return (
    <>
      {header}
      {toolbar}
      <SectionList
        ref={list}
        sections={sections}
        keyExtractor={(t) => String(t.id)}
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: p.bg }}
        contentContainerStyle={{ paddingBottom: 120 }}
        stickySectionHeadersEnabled={false}
        initialNumToRender={14}
        maxToRenderPerBatch={12}
        windowSize={9}
        removeClippedSubviews={process.env.EXPO_OS === 'ios'}
        keyboardDismissMode="on-drag"
        scrollEventThrottle={64}
        onScrollBeginDrag={(e) => { top.current ??= e.nativeEvent.contentOffset.y }}
        onScroll={(e) => { y.current = e.nativeEvent.contentOffset.y }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        onEndReachedThreshold={0.6}
        onEndReached={feed.more}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: space.l, paddingTop: space.s, paddingBottom: space.s, gap: space.m }}>
            {gate.note}
            <Switcher options={FILTERS} initial="all" onChange={choose} />
            {line ? <Txt v="subhead" tone="label2">{line}</Txt> : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.xl + space.xs, paddingTop: space.xl, paddingBottom: space.s }}>
            <Txt v="subhead" weight="600" tone="label2">{section.title}</Txt>
            {section.spent > 0 && <Txt v="subhead" tone="label2" num>{formatCents(section.spent)}</Txt>}
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const first = index === 0, last = index === section.data.length - 1
          return (
            <View style={{ marginHorizontal: space.l, overflow: 'hidden', backgroundColor: p.card, borderCurve: 'continuous',
              borderTopLeftRadius: first ? radius.card : 0, borderTopRightRadius: first ? radius.card : 0,
              borderBottomLeftRadius: last ? radius.card : 0, borderBottomRightRadius: last ? radius.card : 0 }}>
              {!first && <View style={{ height: 0.5, backgroundColor: p.separator, marginLeft: 70 }} />}
              <TxnRow t={item} />
            </View>
          )
        }}
        ListEmptyComponent={failed.kind !== 'ready' ? <Blocked kind={failed.kind} onRetry={feed.q.refetch} /> : q
          ? <Empty symbol="magnifyingglass" title={`No Results for “${q}”`} body="Check the spelling or try a new search." />
          : <Empty symbol="list.bullet.rectangle" title="No Transactions" />}
        ListFooterComponent={feed.q.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: space.xl }} /> : null}
      />
    </>
  )
}
