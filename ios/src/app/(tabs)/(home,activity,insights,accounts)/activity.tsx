// Activity: every entry, newest first, a day to a card. The Mail-style switcher narrows it to spending, income or
// moves between accounts (transfers, saving and loan payments); the search field in the title bar finds anything by
// name, note or amount.
//
// Switching filters, as in Mail: the capsule moves at once on the UI thread (see Switcher); the list fades out
// (90 ms), swaps to the new filter's rows while it can't be seen, then fades back in (150 ms). The new rows are
// already on the phone (every filter's first page is fetched up front), and a filter that isn't yet keeps the old
// list on screen until it is, so there's never a blank. The swap mounts only a screenful; the rest of the list
// follows once the fade has finished, so the heavy work never lands while something is moving.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, RefreshControl, SectionList, View, type NativeScrollEvent, type NativeSyntheticEvent, type SectionListRenderItem, type ViewStyle } from 'react-native'
import { router, Stack } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type AnimatedStyle } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import type { Txn, TxnQuery } from '@/lib/api'
import { dayLabel } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { pagedQuery, usePaged, useRefresh } from '@/design/feed'
import { byDay, loadOf, searchLine, useLedger, type Filter } from '@/design/ledger'
import { EASE } from '@/design/motion'
import { radius, space, usePalette } from '@/design/theme'
import { Empty } from '@/design/ui/List'
import { Blocked, loadGate } from '@/design/ui/LoadState'
import { Switcher, type SwitchOption } from '@/design/ui/Switcher'
import { headOf } from '@/design/ui/switching'
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

/** The list's fade on a switch, after Mail: out quickly, in a little slower. */
const OUT_MS = 90
const IN_MS = 150
/** Entries a switch mounts first: a screenful and some, so the list fills the screen as it fades in. */
const HEAD = 12

interface Day { key: string; title: string; spent: number; data: Txn[] }
type Fade = AnimatedStyle<ViewStyle>

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id) }, [value, ms])
  return v
}

const keyOf = (t: Txn) => String(t.id)

// A row's card piece: rounded at the top of its day and at the bottom, with a hairline between rows. Memoized so a
// list update re-renders only the rows that changed.
const Row = memo(function Row({ t, first, last, fade }: { t: Txn; first: boolean; last: boolean; fade: Fade }) {
  const p = usePalette()
  return (
    <Animated.View style={[{ marginHorizontal: space.l, overflow: 'hidden', backgroundColor: p.card, borderCurve: 'continuous',
      borderTopLeftRadius: first ? radius.card : 0, borderTopRightRadius: first ? radius.card : 0,
      borderBottomLeftRadius: last ? radius.card : 0, borderBottomRightRadius: last ? radius.card : 0 }, fade]}>
      {!first && <View style={{ height: 0.5, backgroundColor: p.separator, marginLeft: 70 }} />}
      <TxnRow t={t} />
    </Animated.View>
  )
})

const DayHeader = memo(function DayHeader({ title, spent, fade }: { title: string; spent: number; fade: Fade }) {
  return (
    <Animated.View style={[{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.xl + space.xs, paddingTop: space.xl, paddingBottom: space.s }, fade]}>
      <Txt v="subhead" weight="600" tone="label2">{title}</Txt>
      {spent > 0 && <Txt v="subhead" tone="label2" num>{formatCents(spent)}</Txt>}
    </Animated.View>
  )
})

export default function Activity() {
  const p = usePalette()
  const L = useLedger()
  const gate = loadGate(L.q)
  // The filter the list shows. The switcher's own choice runs ahead of it while the list fades.
  const [filter, setFilter] = useState<Filter>('all')
  // False right after a switch: the list holds a screenful until it has faded in.
  const [whole, setWhole] = useState(true)
  const [typed, setTyped] = useState('')
  const q = useDebounced(typed.trim(), 250) || undefined
  const { refreshing, refresh } = useRefresh()
  const feed = usePaged(feedQuery(q, filter), { keep: true })
  // Every filter's first page is fetched up front, for a search too, so a switch finds its list already there.
  const client = useQueryClient()
  useEffect(() => {
    for (const f of FILTERS) client.prefetchInfiniteQuery(pagedQuery(feedQuery(q, f.key))).catch(() => {})
  }, [client, q])
  const { today, typeOf } = L
  const days = useMemo<Day[]>(() => byDay(feed.rows, (t) => typeOf(t) === 'Spending')
    // Keyed by date, so a day and its rows keep their views when a switch or a new page moves them.
    .map((d) => ({ key: d.date, title: dayLabel(d.date, today), spent: d.spent, data: d.data })), [feed.rows, today, typeOf])
  const sections = useMemo(() => (whole ? days : headOf(days, HEAD)), [days, whole])

  // One fade for every row, day title and empty state (the switcher above them stays put).
  const fade = useSharedValue(1)
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }))

  // A new filter starts at the top of its list, as Mail does.
  const list = useRef<SectionList<Txn, Day>>(null)
  const top = useRef<number | null>(null)
  const y = useRef(0)
  const latest = useRef({ q, filter: 'all' as Filter, want: 'all' as Filter })
  useEffect(() => { latest.current.q = q }, [q])

  const reveal = useCallback(() => {
    fade.set(withTiming(1, { duration: IN_MS, easing: EASE }, (done) => { 'worklet'; if (done) scheduleOnRN(setWhole, true) }))
  }, [fade])
  // The swap, while the list can't be seen: to the top, then a screenful of the new filter's rows.
  const apply = useCallback((f: Filter) => {
    const now = latest.current
    if (now.want !== f) return
    if (now.filter === f) { reveal(); return }
    now.filter = f
    if (top.current !== null && y.current > top.current + 4) list.current?.getScrollResponder()?.scrollTo({ y: top.current, animated: false })
    setWhole(false)
    setFilter(f)
  }, [reveal])
  // As soon as the swap has committed, fade the new rows in; the rest of the list follows once they're in.
  useLayoutEffect(() => { if (!whole) reveal() }, [filter, whole, reveal])
  const choose = useCallback((f: Filter) => {
    latest.current.want = f
    // Back to the filter on screen (before the switch away from it landed): it just comes back.
    if (f === latest.current.filter) { reveal(); return }
    // Instant when the filter's page is on the phone. Otherwise the list on screen stays, or comes back if a switch
    // had begun fading it, until the page arrives.
    const query = pagedQuery(feedQuery(latest.current.q, f))
    if (client.getQueryData(query.queryKey) === undefined) reveal()
    client.ensureInfiniteQueryData(query).catch(() => {}).then(() => {
      if (latest.current.want !== f) return
      fade.set(withTiming(0, { duration: OUT_MS, easing: EASE }, (done) => { 'worklet'; if (done) scheduleOnRN(apply, f) }))
    })
  }, [client, fade, apply, reveal])

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

  // Everything the list is handed stays the same object between renders that don't change it, so typing in the
  // search field or a background refetch doesn't re-render every row.
  const renderItem = useCallback<SectionListRenderItem<Txn, Day>>(({ item, index, section }) => (
    <Row t={item} first={index === 0} last={index === section.data.length - 1} fade={fadeStyle} />
  ), [fadeStyle])
  const renderSectionHeader = useCallback(({ section }: { section: Day }) => (
    <DayHeader title={section.title} spent={section.spent} fade={fadeStyle} />
  ), [fadeStyle])
  const listHeader = useMemo(() => (
    <View style={{ paddingHorizontal: space.l, paddingTop: space.s, paddingBottom: space.s, gap: space.m }}>
      {gate.note}
      <Switcher options={FILTERS} initial="all" onChange={choose} />
      {line ? <Txt v="subhead" tone="label2">{line}</Txt> : null}
    </View>
  ), [gate.note, choose, line])
  const { refetch } = feed.q
  const empty = useMemo(() => (
    <Animated.View style={fadeStyle}>
      {failed.kind !== 'ready' ? <Blocked kind={failed.kind} onRetry={refetch} /> : q
        ? <Empty symbol="magnifyingglass" title={`No Results for “${q}”`} body="Check the spelling or try a new search." />
        : <Empty symbol="list.bullet.rectangle" title="No Transactions" />}
    </Animated.View>
  ), [fadeStyle, failed.kind, refetch, q])
  const paging = feed.q.isFetchingNextPage
  const footer = useMemo(() => (paging ? <ActivityIndicator style={{ marginVertical: space.xl }} /> : null), [paging])
  const refresher = useMemo(() => <RefreshControl refreshing={refreshing} onRefresh={refresh} />, [refreshing, refresh])
  const more = useRef(feed.more)
  useEffect(() => { more.current = feed.more })
  // Only once the whole list is back: a screenful mid-switch would otherwise look like the end of the list.
  const onEndReached = useCallback(() => more.current(), [])
  const onScrollBeginDrag = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => { top.current ??= e.nativeEvent.contentOffset.y }, [])
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => { y.current = e.nativeEvent.contentOffset.y }, [])
  const style = useMemo(() => ({ backgroundColor: p.bg }), [p.bg])

  return (
    <>
      {header}
      {toolbar}
      <SectionList
        ref={list}
        sections={sections}
        keyExtractor={keyOf}
        contentInsetAdjustmentBehavior="automatic"
        style={style}
        contentContainerStyle={CONTENT}
        stickySectionHeadersEnabled={false}
        initialNumToRender={14}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={process.env.EXPO_OS === 'ios'}
        keyboardDismissMode="on-drag"
        scrollEventThrottle={64}
        onScrollBeginDrag={onScrollBeginDrag}
        onScroll={onScroll}
        refreshControl={refresher}
        onEndReachedThreshold={0.6}
        onEndReached={whole ? onEndReached : undefined}
        ListHeaderComponent={listHeader}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
      />
    </>
  )
}

const CONTENT = { paddingBottom: 120 }
