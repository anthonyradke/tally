// Activity: every entry, newest first, a day to a card, with what's still pending at the bank dimmed above them. The
// Mail-style switcher narrows it to spending, income or moves between accounts (transfers, saving and loan payments);
// the search field in the title bar finds anything by name, note or amount.
//
// Switching filters: the capsule moves at once on the UI thread (Switcher). The top of the list is a screenful
// (Screenful.tsx) rather than list cells, so the old filter's screenful and the new one are on screen together: the
// old drifts away from the side the capsule moved toward and fades while the new comes in from that side, the first
// rows a beat ahead of the rest (switching.ts, ~320 ms). There's never an empty frame: the new screenful is mounted
// (hidden) before the move starts, and the old one stays until it has finished. A filter whose first page isn't on
// the phone yet comes in as placeholder rows, which crossfade to the real ones in place when the page arrives. The
// rest of the list, below the screenful, is mounted once a move is over. Every filter's first page is fetched up
// front, so a placeholder is rare.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, RefreshControl, SectionList, View, type NativeScrollEvent, type NativeSyntheticEvent, type SectionListRenderItem } from 'react-native'
import { router, Stack } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import type { Txn, TxnQuery } from '@/lib/api'
import { usePending } from '@/lib/bank'
import { dayLabel } from '@/lib/dates'
import { pagedQuery, usePaged, useRefresh } from '@/design/feed'
import { byDay, loadOf, searchLine, useLedger, type Filter } from '@/design/ledger'
import { pendingFor } from '@/design/pending'
import { space, usePalette } from '@/design/theme'
import { Empty } from '@/design/ui/List'
import { Blocked, loadGate } from '@/design/ui/LoadState'
import { DayHeader, Row, Screenful, Skeleton, type Day, type Swap } from '@/design/ui/Screenful'
import { Switcher, type SwitchOption } from '@/design/ui/Switcher'
import { sideOf, splitHead, SWAP_MS } from '@/design/ui/switching'
import { Txt } from '@/design/ui/Txt'

const FILTERS: SwitchOption<Filter>[] = [
  { key: 'all', label: 'All', symbol: 'tray.fill', hue: 'tint' },
  { key: 'Spending', label: 'Spending', symbol: 'bag.fill', hue: 'pink' },
  { key: 'Money in', label: 'Income', symbol: 'arrow.down.circle.fill', hue: 'green' },
  { key: 'Transfer', label: 'Transfers', symbol: 'arrow.left.arrow.right', hue: 'indigo' },
]
const KEYS = FILTERS.map((f) => f.key)
const TYPES: Record<Filter, TxnQuery['type']> = { all: undefined, Spending: 'Spending', 'Money in': 'Money in', Transfer: 'Transfer,Loan,Saving' }
// Newest first, and a search's exact-amount matches kept in date order, so a day never splits in two.
const feedQuery = (q: string | undefined, filter: Filter): TxnQuery => ({ q, type: TYPES[filter], sort: 'date', dir: 'desc', exact_first: 0 })

/** Entries in the screenful a switch moves: a screen's worth and some. */
const HEAD = 12
const NONE: Day[] = []

/** One screenful of the list's top. A screenful on its way out keeps what it showed (`days`, `empty`). */
interface Face { gen: number; filter: Filter; kind: 'rows' | 'skeleton'; days?: Day[]; empty?: ReactNode }

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id) }, [value, ms])
  return v
}

const keyOf = (t: Txn) => String(t.id)
const ABOVE = { position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none' } as const

const TailHeader = memo(function TailHeader({ section }: { section: Day }) {
  return section.cont ? null : <DayHeader title={section.title} spent={section.spent} />
})

export default function Activity() {
  const p = usePalette()
  const L = useLedger()
  const gate = loadGate(L.q)
  const client = useQueryClient()
  const [typed, setTyped] = useState('')
  const q = useDebounced(typed.trim(), 250) || undefined
  const { refreshing, refresh } = useRefresh()
  const cachedFor = useCallback((query: string | undefined, f: Filter) => client.getQueryData(pagedQuery(feedQuery(query, f)).queryKey) !== undefined, [client])

  // The switcher's choice; the list follows it a move at a time.
  const [want, setWant] = useState<Filter>('all')
  const [faces, setFaces] = useState<Face[]>(() => [{ gen: 0, filter: 'all', kind: cachedFor(undefined, 'all') ? 'rows' : 'skeleton' }])
  const cur = faces[faces.length - 1]
  const moving = faces.length > 1
  const filter = cur.filter

  const feed = usePaged(feedQuery(q, filter), { keep: true })
  // Every filter's first page is fetched up front, for a search too, so a switch finds its list already there.
  useEffect(() => {
    for (const f of FILTERS) client.prefetchInfiniteQuery(pagedQuery(feedQuery(q, f.key))).catch(() => {})
  }, [client, q])
  const pendingRows = usePending().data
  const pending = useMemo(() => pendingFor(pendingRows, filter, q).map((r) => ({ pending: true as const, r })), [pendingRows, filter, q])
  const { today, typeOf } = L
  const days = useMemo<Day[]>(() => byDay(feed.rows, (t) => typeOf(t) === 'Spending')
    // Keyed by date, so a day and its rows keep their views when a new page or a refresh moves them.
    .map((d) => ({ key: d.date, title: dayLabel(d.date, today), spent: d.spent, data: d.data })), [feed.rows, today, typeOf])
  const split = useMemo(() => splitHead(days, HEAD), [days])
  const head = useMemo<Day[]>(() => (pending.length ? [{ key: 'pending', title: 'Pending', spent: 0, data: pending }, ...split.head] : split.head), [pending, split.head])
  const failed = loadOf(feed.q)
  const { refetch } = feed.q
  const empty = useMemo(() => (failed.kind !== 'ready' ? <Blocked kind={failed.kind} onRetry={refetch} /> : q
    ? <Empty symbol="magnifyingglass" title={`No Results for “${q}”`} body="Check the spelling or try a new search." />
    : <Empty symbol="list.bullet.rectangle" title="No Transactions" />), [failed.kind, refetch, q])
  // The filter's page has come (or failed): placeholder rows can give way to it.
  const settled = !feed.q.isPlaceholderData && (feed.q.data !== undefined || !!feed.q.error)

  // The move. Screenful `gen` comes in while `clock` goes from gen - 1 to gen, and leaves on the next move.
  const clock = useSharedValue(0)
  const dir = useSharedValue(0)
  const swap = useMemo<Swap>(() => ({ clock, dir }), [clock, dir])
  const shown = useRef({ head, empty, q, faces })
  useLayoutEffect(() => { shown.current = { head, empty, q, faces } })
  const list = useRef<SectionList<Txn, Day>>(null)
  const top = useRef<number | null>(null)
  const y = useRef(0)

  // A new screenful under the old one (hidden until the move starts), from the top of the list as Mail does.
  const begin = useCallback((f: Filter, side: number, kind: Face['kind']) => {
    if (top.current !== null && y.current > top.current + 4) list.current?.getScrollResponder()?.scrollTo({ y: top.current, animated: false })
    dir.set(side)
    setFaces((fs) => {
      const c = fs[fs.length - 1]
      return [{ ...c, days: c.kind === 'rows' ? shown.current.head : undefined, empty: shown.current.empty }, { gen: c.gen + 1, filter: f, kind }]
    })
  }, [dir])
  const finish = useCallback((gen: number) => setFaces((fs) => fs.filter((x) => x.gen >= gen)), [])
  // Once the new screenful is laid out and a frame has been drawn with it (hidden), both ride the move on the UI
  // thread, then the old one goes. Started any sooner, a slow first frame of the new rows ate the start of the move.
  const started = useRef(0)
  const go = useCallback((gen: number) => {
    if (gen <= started.current) return
    started.current = gen
    requestAnimationFrame(() => requestAnimationFrame(() => {
      clock.set(withTiming(gen, { duration: SWAP_MS, easing: Easing.linear }, () => { 'worklet'; scheduleOnRN(finish, gen) }))
    }))
  }, [clock, finish])
  useEffect(() => {
    if (!moving) return
    const id = setTimeout(() => go(cur.gen), 600) // in case its layout never reports
    return () => clearTimeout(id)
  }, [moving, cur.gen, go])
  // Between moves: on to the latest choice, or from placeholders to the page that came.
  useEffect(() => {
    if (moving) return
    if (want !== cur.filter) begin(want, sideOf(KEYS, cur.filter, want), cachedFor(shown.current.q, want) ? 'rows' : 'skeleton')
    else if (cur.kind === 'skeleton' && settled) begin(want, 0, 'rows')
  }, [moving, want, cur.filter, cur.kind, settled, begin, cachedFor])
  // A choice with nothing moving starts its move in the same render, not one effect later.
  const choose = useCallback((f: Filter) => {
    setWant(f)
    const fs = shown.current.faces
    if (fs.length === 1 && fs[0].filter !== f) begin(f, sideOf(KEYS, fs[0].filter, f), cachedFor(shown.current.q, f) ? 'rows' : 'skeleton')
  }, [begin, cachedFor])

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
  const line = q && feed.first && !moving && cur.kind === 'rows' ? searchLine(feed.first, filter) : null

  const stage = faces.map((f, k) => {
    const leaving = k < faces.length - 1
    return (
      <View key={f.gen} style={leaving ? ABOVE : undefined} onLayout={leaving ? undefined : () => go(f.gen)}>
        {f.kind === 'skeleton' ? <Skeleton swap={swap} gen={f.gen} />
          : <Screenful swap={swap} gen={f.gen} days={leaving ? f.days ?? NONE : head} empty={leaving ? f.empty : empty} />}
      </View>
    )
  })
  const listHeader = (
    <View>
      <View style={{ paddingHorizontal: space.l, paddingTop: space.s, paddingBottom: space.s, gap: space.m }}>
        {gate.note}
        <Switcher options={FILTERS} initial="all" onChange={choose} />
        {line ? <Txt v="subhead" tone="label2">{line}</Txt> : null}
      </View>
      <View>{stage}</View>
    </View>
  )

  // The rest of the list, below the screenful: list cells, mounted a few at a time as you scroll.
  const sections = !moving && cur.kind === 'rows' ? split.tail : NONE
  const renderItem = useCallback<SectionListRenderItem<Txn, Day>>(({ item, index, section }) => (
    <Row x={item} first={index === 0 && !section.cont} last={index === section.data.length - 1} />
  ), [])
  const renderSectionHeader = useCallback(({ section }: { section: Day }) => <TailHeader section={section} />, [])
  const paging = feed.q.isFetchingNextPage
  const footer = useMemo(() => (paging ? <ActivityIndicator style={{ marginVertical: space.xl }} /> : null), [paging])
  const refresher = useMemo(() => <RefreshControl refreshing={refreshing} onRefresh={refresh} />, [refreshing, refresh])
  const more = useRef(feed.more)
  useEffect(() => { more.current = feed.more })
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
        sections={sections as (Day & { data: Txn[] })[]}
        keyExtractor={keyOf}
        contentInsetAdjustmentBehavior="automatic"
        style={style}
        contentContainerStyle={CONTENT}
        stickySectionHeadersEnabled={false}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={process.env.EXPO_OS === 'ios'}
        keyboardDismissMode="on-drag"
        scrollEventThrottle={64}
        onScrollBeginDrag={onScrollBeginDrag}
        onScroll={onScroll}
        refreshControl={refresher}
        onEndReachedThreshold={0.6}
        onEndReached={moving ? undefined : onEndReached}
        ListHeaderComponent={listHeader}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        ListFooterComponent={footer}
      />
    </>
  )
}

const CONTENT = { paddingBottom: 120 }
