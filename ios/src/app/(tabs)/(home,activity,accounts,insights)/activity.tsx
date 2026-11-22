import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshControl, TextInput, View } from 'react-native'
import { router, Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRoute } from 'expo-router'
import { FlashList, type FlashListRef } from '@shopify/flash-list'
import type { SearchBarCommands } from 'react-native-screens'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated'
import { FilterBar } from '@/components/FilterBar'
import { Icon } from '@/components/Icon'
import { Mark } from '@/components/Mark'
import { merchantKey } from '@/icons/merchants'
import { Money } from '@/components/Money'
import { Glow } from '@/components/Glow'
import { HAIRLINE } from '@/components/Panel'
import { SelectionBar } from '@/components/SelectionBar'
import { StateView } from '@/components/StateView'
import { closeSwipes } from '@/components/SwipeRow'
import { Tap } from '@/components/Tap'
import { TxnRow } from '@/components/TxnRow'
import { Txt } from '@/components/Txt'
import { api, type Txn } from '@/lib/api'
import { dayLabel, lastOfMonth } from '@/lib/dates'
import { feedItems, type Item } from '@/lib/feed'
import { isAhead, next30 } from '@/lib/filterBar'
import { EMPTY, extraCount, toId, toQuery, useFilters, type Filters } from '@/lib/filters'
import { formatCents } from '@/lib/money'
import { useOutbox } from '@/lib/outbox'
import { usePullRefresh } from '@/lib/refresh'
import { useBusy, useLatest } from '@/lib/nav'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { radius, space, useTheme } from '@/theme'

const PAGE = 100
const MAX_PICK = 5000 // what one bulk action takes (inputs.MAX_IDS)
const filterKey = () => JSON.stringify(toQuery(useFilters.getState().f))
const HINT ='Search names, notes, tags and amounts. Try 12.50, >50, yesterday, last week, last month, aug or #trip.'

export default function Activity() {
  const { c } = useTheme()
  const t = useTally()
  const { f, set } = useFilters()
  const params = useLocalSearchParams<{ q?: string; when?: string; day?: string; month?: string; category?: string; account?: string; tag?: string; group?: string }>()
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [pool, setPool] = useState<Map<number, Txn>>(new Map()) // rows Select all fetched past the loaded pages
  const [searching, setSearching] = useState(false)
  const queued = useOutbox((s) => s.items)
  const busy = useBusy()

  // Activity pushed from another screen (Home's Recent, a category, an account, a tag) starts from cleared filters,
  // with or without params: a plain link used to open on whatever search the tab had left, often hidden. The filters
  // are shared with the Activity tab, so the ones it had come back when this screen closes.
  const nav = useNavigation()
  const route = useRoute()
  const [pushed] = useState(() => nav.getState()?.routes[0]?.key !== route.key)
  const before = useRef<{ f: Filters; view: number | null } | null>(null)
  useEffect(() => () => { if (before.current) useFilters.getState().replace(before.current.f, before.current.view) }, [])
  useEffect(() => {
    const p: Partial<Filters> = {}
    if (params.when === 'upcoming' && t.b) Object.assign(p, next30(t.b.today)) // Home's Coming up: the same 30 days
    if (params.day) { p.start = params.day; p.end = params.day; p.sort = 'date'; p.dir = 'desc' } // a day from Insights' calendar
    if (params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month)) { p.start = `${params.month}-01`; p.end = lastOfMonth(p.start) } // a month from a category
    if (params.q) p.q = params.q // a place's page: everything with its name
    if (params.category) p.category = toId(params.category)
    if (params.account) p.account = toId(params.account)
    if (params.tag) p.tag = params.tag
    if (params.group) p.group = params.group
    if (!Object.keys(p).length && !pushed) return
    before.current ??= { f: useFilters.getState().f, view: useFilters.getState().view }
    useFilters.getState().replace({ ...EMPTY, ...p })
  }, [params.q, params.when, params.day, params.month, params.category, params.account, params.tag, params.group, t.b?.today]) // eslint-disable-line react-hooks/exhaustive-deps
  // An account that's gone (deleted since a saved view, or a stale link) would filter to nothing with no chip lit.
  useEffect(() => {
    if (t.b && f.account != null && !t.b.accounts.some((a) => a.id === f.account)) set({ account: undefined })
  }, [t.b, f.account]) // eslint-disable-line react-hooks/exhaustive-deps

  // Search waits for a pause in typing: every keystroke was a request, and a cached list kept on the phone.
  const [qText, setQText] = useState(f.q)
  useEffect(() => {
    const id = setTimeout(() => setQText(f.q), f.q ? 250 : 0)
    return () => clearTimeout(id)
  }, [f.q])
  const query = toQuery({ ...f, q: qText })
  const q = useInfiniteQuery({
    queryKey: ['transactions', 'feed', query],
    queryFn: ({ pageParam }) => api.transactions({ ...query, limit: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (pages.length * PAGE < last.total ? pages.length * PAGE : undefined),
    // A new filter or search keeps the current list up until its results land, instead of flashing the skeleton.
    placeholderData: keepPreviousData,
  })
  const pull = usePullRefresh(() => Promise.all([q.refetch(), t.q.refetch()]))
  // Once each: a recurring row posted between two page fetches shifts the offsets, and a row could come twice.
  const rows = useMemo(() => {
    const seen = new Set<number>()
    return (q.data?.pages.flatMap((p) => p.items) ?? []).filter((r) => !seen.has(r.id) && !!seen.add(r.id))
  }, [q.data])
  const first = q.data?.pages[0]
  const today = t.b?.today ?? t.today
  const ahead = isAhead(f, today)

  // Filters changed from the sheet or a saved view land at the top of the new list, where its count and total are;
  // edits, deletes and refreshes keep the place. The top is where the first drag started (iOS insets it under the
  // large title), so a list never dragged is left alone.
  const list = useRef<FlashListRef<Item>>(null)
  const topY = useRef<number | null>(null)
  const leftAt = useRef<string | null>(null)
  useFocusEffect(useCallback(() => {
    if (leftAt.current != null && leftAt.current !== filterKey() && topY.current != null) list.current?.scrollToOffset({ offset: topY.current, animated: true })
    return () => { leftAt.current = filterKey() }
  }, []))

  // Newest first, the scheduled entries (recurring bills a month out) used to fill the top of the list before anything
  // that had happened. They fold into one row until you open it; a date filter or the Upcoming chip shows them as usual.
  const [showSched, setShowSched] = useState(false)
  const items = useMemo<Item[]>(() => feedItems(rows, {
    byAmount: f.sort === 'amount', fold: f.sort === 'date' && f.dir === 'desc' && !f.start && !f.end, showSched,
    exact: first?.exact ?? 0, today, typeOf: t.typeOf,
  }), [rows, f.sort, f.dir, f.start, f.end, showSched, first?.exact, today, t.typeOf])

  const filtered = !!(f.q || f.type || extraCount(f))
  // Searching for a place: its page is one tap away (the name most of the matches share).
  const place = useMemo(() => {
    const want = merchantKey(f.q)
    if (want.length < 3) return null
    const n = new Map<string, { name: string; count: number }>()
    for (const r of rows) {
      const k = merchantKey(r.what)
      if (k.includes(want)) n.set(k, { name: n.get(k)?.name ?? r.what, count: (n.get(k)?.count ?? 0) + 1 })
    }
    const top = [...n.entries()].sort((a, z) => z[1].count - a[1].count)[0]
    return top ? { key: top[0], ...top[1] } : null
  }, [f.q, rows])
  const extra = extraCount(f)
  const toggle = useCallback((id: number) => {
    Haptics.selectionAsync().catch(() => {})
    setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }, [])
  // Select mode: one shared value slides every row's check circle in together on the UI thread, so entering and
  // leaving it doesn't rebuild the list.
  const sel = useSharedValue(0)
  const startSelect = () => {
    closeSwipes()
    Haptics.selectionAsync().catch(() => {})
    setSelecting(true)
    sel.set(withTiming(1, { duration: 280, easing: Easing.bezier(0.23, 1, 0.32, 1) }))
  }
  const endSelect = () => {
    setSelecting(false)
    setPicked(new Set())
    setPool(new Map())
    sel.set(withTiming(0, { duration: 240, easing: Easing.bezier(0.23, 1, 0.32, 1) }))
  }
  const matching = Math.min(first?.total ?? rows.length, MAX_PICK)
  // Every match of the filters, including pages not loaded yet (fetched once, up to what one bulk action takes).
  const selectAll = (on: boolean) => busy(async () => {
    Haptics.selectionAsync().catch(() => {})
    if (!on) { setPicked(new Set()); return }
    if (rows.length >= matching) { setPicked(new Set(rows.slice(0, matching).map((r) => r.id))); return }
    try {
      const all = await api.transactions({ ...query, limit: matching, offset: 0 })
      setPool(new Map(all.items.map((r) => [r.id, r])))
      setPicked(new Set(all.items.map((r) => r.id)))
    } catch { toast({ text: "Couldn't load every match. Tally is unreachable.", tone: 'error' }) }
  })
  const chosen = useMemo(() => {
    const byId = new Map(pool)
    for (const r of rows) byId.set(r.id, r)
    return [...picked].map((id) => byId.get(id)).filter((r): r is Txn => !!r)
  }, [picked, pool, rows])

  const header = (
    <View style={{ gap: space.m, paddingBottom: space.s }}>
      <Glow />
      {process.env.EXPO_OS === 'web' && (
        <View style={{ height: 40, borderRadius: radius.input, backgroundColor: c.fill, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.m, gap: space.s, marginHorizontal: space.l }}>
          <Icon sf="magnifyingglass" md="search" size={16} color={c.label2} />
          <TextInput placeholder="Search entries, notes, tags, amounts" placeholderTextColor={c.label2} value={f.q} onChangeText={(q) => set({ q })}
            onFocus={() => setSearching(true)} onBlur={() => setSearching(false)} style={{ flex: 1, fontSize: 17, color: c.label }} />
        </View>
      )}
      {searching && !f.q && <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l + space.xs }}>{HINT}</Txt>}
      <FilterBar />
      {queued.length > 0 && (
        // Each waiting entry, dimmed like a scheduled one, so a week caught up offline still reads as done.
        <Tap feedback="opacity" onPress={() => router.push('/settings/server')} accessibilityHint="Opens Settings, Server"
          style={{ marginHorizontal: space.l, padding: space.m, borderRadius: radius.input, backgroundColor: c.panel, gap: space.s }}>
          <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
            <Icon sf="icloud.and.arrow.up" md="cloud_upload" size={16} color={c.warn} />
            <Txt variant="sub" style={{ flex: 1 }}>{queued.length === 1 ? '1 entry is' : `${queued.length} entries are`} {"waiting to reach Tally. They'll send when you're back on Tailscale."}</Txt>
          </View>
          {queued.slice(0, 6).map((x) => (
            <View key={x.cid} style={{ flexDirection: 'row', gap: space.s, paddingLeft: 16 + space.s, opacity: 0.6 }}>
              <Txt variant="sub" numberOfLines={1} style={{ flex: 1 }}>{x.error ? `${x.label}: ${x.error}` : x.label}</Txt>
              <Txt variant="sub" tone="label2">{dayLabel(x.lines[0]?.date ?? t.today, t.today)}</Txt>
              <Txt variant="sub" num>{formatCents(x.lines.reduce((n, l) => n + l.amount, 0))}</Txt>
            </View>
          ))}
          {queued.length > 6 && <Txt variant="foot" tone="label2" style={{ paddingLeft: 16 + space.s }}>{`and ${queued.length - 6} more`}</Txt>}
        </Tap>
      )}
      {place && (
        <Tap feedback="opacity" href={{ pathname: '/merchant/[key]', params: { key: place.key } }}
          style={{ marginHorizontal: space.l, paddingHorizontal: space.l, height: 52, borderRadius: radius.panel, backgroundColor: c.panel, flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          {t.markFor(place.name) ? <Mark kind="spec" spec={t.markFor(place.name)!} size={30} /> : <Icon sf="storefront" md="storefront" size={18} color={c.label2} />}
          <Txt variant="row" style={{ flex: 1 }} numberOfLines={1}>{place.name}</Txt>
          <Txt variant="sub" tone="label2">See the place</Txt>
          <Icon sf="chevron.right" md="chevron_right" size={13} color={c.label3} weight="bold" />
        </Tap>
      )}
      {filtered && first && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.l + space.xs }}>
          <Txt variant="sub" tone="label2">{first.total === 1 ? '1 entry' : `${first.total} entries`}</Txt>
          <Tap feedback="opacity" onPress={() => useFilters.getState().reset()} hitSlop={10}>
            <Txt variant="sub" tone="label" style={{ fontWeight: '600' }}>Clear filters</Txt>
          </Tap>
        </View>
      )}
      {filtered && first && (
        <View style={{ flexDirection: 'row', gap: space.l, paddingHorizontal: space.l + space.xs }}>
          {/* Only scheduled entries: nothing is spent yet. */}
          {first.by_type.Spending != null && <Sum label={ahead ? 'Scheduled' : 'Spent'} cents={first.by_type.Spending} />}
          {first.by_type['Money in'] != null && <Sum label={ahead ? 'Coming in' : 'Money in'} cents={first.by_type['Money in']} pos />}
        </View>
      )}
    </View>
  )

  // The native search bar keeps its own text: a search set from elsewhere (a place's "All at…", Clear filters, a
  // saved view) is written into it, or it showed nothing while the list was filtered.
  const searchBar = useRef<SearchBarCommands | null>(null)
  const typed = useRef('')
  useEffect(() => {
    if (f.q === typed.current) return
    typed.current = f.q
    const id = setTimeout(() => searchBar.current?.setText(f.q), 0) // the ref lands after the header mounts
    return () => clearTimeout(id)
  }, [f.q])

  // Kept from one render to the next: a new one rebuilds the header's buttons, and a tap in between was lost.
  const live = useLatest({ startSelect, endSelect, account: f.account })
  const toolbar = useMemo(() => (
    <>
      {process.env.EXPO_OS !== 'web' && (
        <Stack.SearchBar ref={searchBar} placeholder="Entries, notes, tags, amounts" onChangeText={(e) => { typed.current = e.nativeEvent.text; set({ q: e.nativeEvent.text }) }}
          onFocus={() => setSearching(true)} onBlur={() => setSearching(false)}
          onCancelButtonPress={() => { typed.current = ''; set({ q: '' }) }} hideWhenScrolling={false} />
      )}
      {/* Buttons are direct children (arrays, not a fragment): the native toolbar silently drops a fragment. */}
      <Stack.Toolbar placement="right">
        {selecting ? [
          <Stack.Toolbar.Button key="done" variant="done" onPress={() => live.current.endSelect()}>Done</Stack.Toolbar.Button>,
        ] : [
          <Stack.Toolbar.Button key="filters" icon={extra ? 'line.3.horizontal.decrease.circle.fill' : 'line.3.horizontal.decrease.circle'}
            accessibilityLabel={extra ? `Filters, ${extra} on` : 'Filters'} onPress={() => router.push('/filters')} />,
          <Stack.Toolbar.Button key="select" icon="checkmark.circle" accessibilityLabel="Select entries" onPress={() => live.current.startSelect()} />,
          <Stack.Toolbar.Button key="catchup" icon="text.badge.plus" accessibilityLabel="Catch up an account"
            onPress={() => router.push({ pathname: '/catchup', params: live.current.account != null ? { account: String(live.current.account) } : {} })} />,
        ]}
      </Stack.Toolbar>
    </>
  ), [selecting, extra]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {toolbar}
      <View style={{ flex: 1, backgroundColor: c.bg }} collapsable={false}>
        <FlashList
          ref={list}
          data={t.b ? items : []}
          keyExtractor={(it) => it.key}
          getItemType={(it) => it.kind}
          contentInsetAdjustmentBehavior="automatic"
          // FlashList pins the first visible row by default (for chats). A new filter's results that still hold that
          // row further down would jump the list to it, so the page stays at its scroll position instead.
          maintainVisibleContentPosition={{ disabled: true }}
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: selecting ? 200 : 120 }}
          extraData={picked}
          onScrollBeginDrag={(e) => { closeSwipes(); topY.current = Math.min(topY.current ?? Infinity, e.nativeEvent.contentOffset.y) }}
          ListHeaderComponent={header}
          refreshControl={<RefreshControl {...pull} />}
          onEndReached={() => { if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage() }}
          onEndReachedThreshold={0.6}
          ListEmptyComponent={
            q.isError || t.q.isError ? <StateView q={q.isError ? (q as never) : t.q} /> :
            q.isLoading || !t.b ? <View style={{ paddingHorizontal: space.l }}><StateView q={t.q} shape="list" /></View> :
            <Empty filtered={filtered} />
          }
          renderItem={({ item }) => {
            if (item.kind === 'sched') {
              return (
                <Tap feedback="opacity" onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowSched(!item.open) }}
                  accessibilityLabel={`${item.count} scheduled. ${item.open ? 'Hide' : 'Show'}`}
                  style={{ marginHorizontal: space.l, marginTop: space.s, paddingHorizontal: space.l, height: 48, borderRadius: radius.panel, backgroundColor: c.panel,
                    flexDirection: 'row', alignItems: 'center', gap: space.m }}>
                  <Icon sf="calendar.badge.clock" md="event_upcoming" size={18} color={c.label2} />
                  <Txt variant="row" style={{ flex: 1 }}>{item.count} scheduled</Txt>
                  {item.cents > 0 && <Txt variant="sub" tone="label2" num>{formatCents(item.cents)}</Txt>}
                  <Icon sf={item.open ? 'chevron.up' : 'chevron.down'} md={item.open ? 'expand_less' : 'expand_more'} size={13} color={c.label3} weight="bold" />
                </Tap>
              )
            }
            if (item.kind === 'label') {
              return <Txt variant="sub" tone="label2" accessibilityRole="header" style={{ paddingHorizontal: space.l + space.xs, paddingTop: space.l, fontWeight: '600' }}>{item.text}</Txt>
            }
            if (item.kind === 'head') {
              return (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: space.l + space.xs, paddingTop: space.l, paddingBottom: space.s }}>
                  <Txt variant="headline">{dayLabel(item.date, t.b!.today)}</Txt>
                  {/* A day still ahead has bills due, not spending. */}
                  {item.spent > 0 && <Txt variant="sub" tone="label2" num>{formatCents(item.spent)} {item.date > t.b!.today ? 'due' : 'spent'}</Txt>}
                </View>
              )
            }
            const r = item.t
            return (
              <View style={{
                marginHorizontal: space.l, backgroundColor: c.panel, overflow: 'hidden', borderCurve: 'continuous',
                borderTopLeftRadius: item.first ? radius.panel : 0, borderTopRightRadius: item.first ? radius.panel : 0,
                borderBottomLeftRadius: item.last ? radius.panel : 0, borderBottomRightRadius: item.last ? radius.panel : 0,
              }}>
                {!item.first && <Divider sel={sel} />}
                <TxnRow t={r} c={t.catOf(r)} acct={t.acct} mark={t.markFor(r.what)} today={t.b!.today} here={f.account}
                  showDate={f.sort === 'amount' ? dayLabel(r.date, t.b!.today) : undefined}
                  sel={sel} selected={picked.has(r.id)} onSelect={selecting ? toggle : undefined}
                  padTop={item.first ? space.xs : 0} padBottom={item.last ? space.xs : 0} />
              </View>
            )
          }}
        />
        {selecting && <SelectionBar chosen={chosen} matching={matching} onAll={selectAll} onDone={endSelect} />}
      </View>
    </>
  )
}

/** The hairline between rows, inset to the text; it follows the text over when select mode slides the checks in. */
function Divider({ sel }: { sel: SharedValue<number> }) {
  const { c } = useTheme()
  const style = useAnimatedStyle(() => ({ marginLeft: space.l + 40 + space.m + sel.get() * 34 }))
  return <Animated.View style={[{ height: HAIRLINE, backgroundColor: c.sep }, style]} />
}

function Sum({ label, cents, pos }: { label: string; cents: number; pos?: boolean }) {
  return (
    <View style={{ gap: 1 }}>
      <Txt variant="foot" tone="label2">{label}</Txt>
      <Money cents={Math.abs(cents)} tone={pos ? 'pos' : 'neutral'} variant="headline" />
    </View>
  )
}

function Empty({ filtered }: { filtered: boolean }) {
  const { c } = useTheme()
  return (
    <View style={{ alignItems: 'center', paddingTop: 64, paddingHorizontal: space.xxl, gap: space.s }}>
      <Icon sf={filtered ? 'magnifyingglass' : 'tray'} md={filtered ? 'search_off' : 'inbox'} size={32} color={c.label3} />
      <Txt variant="headline">{filtered ? 'No matches' : 'Nothing logged yet'}</Txt>
      <Txt variant="callout" tone="label2" style={{ textAlign: 'center' }}>
        {filtered ? 'Try fewer filters, or search for part of a name, a note, a tag or an amount. Search also takes >50, <20, yesterday, last week, a month like aug, and #tags.' : 'Tap + to add your first entry.'}
      </Txt>
    </View>
  )
}
