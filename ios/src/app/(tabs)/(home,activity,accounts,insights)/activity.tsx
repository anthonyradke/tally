import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, TextInput, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { FlashList } from '@shopify/flash-list'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import Animated, { Easing, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated'
import { Chip } from '@/components/Chip'
import { Icon } from '@/components/Icon'
import { Money } from '@/components/Money'
import { Glow } from '@/components/Glow'
import { StateView } from '@/components/StateView'
import { closeSwipes } from '@/components/SwipeRow'
import { Tap } from '@/components/Tap'
import { TxnRow } from '@/components/TxnRow'
import { Txt } from '@/components/Txt'
import { api, type CatType, type Txn } from '@/lib/api'
import { deleteTxns } from '@/lib/actions'
import { dayLabel } from '@/lib/dates'
import { extraCount, toQuery, useFilters } from '@/lib/filters'
import { formatCents } from '@/lib/money'
import { useOutbox } from '@/lib/outbox'
import { usePullRefresh } from '@/lib/refresh'
import { useTally } from '@/lib/tally'
import { radius, space, useTheme } from '@/theme'

const PAGE = 100
const TYPES: [CatType | '', string][] = [['', 'All'], ['Spending', 'Spending'], ['Money in', 'Money in'], ['Transfer', 'Transfers'], ['Saving', 'Saving'], ['Loan', 'Loans']]

type Item =
  | { kind: 'head'; key: string; date: string; spent: number }
  | { kind: 'row'; key: string; t: Txn; first: boolean; last: boolean }

export default function Activity() {
  const { c } = useTheme()
  const t = useTally()
  const { f, set } = useFilters()
  const params = useLocalSearchParams<{ when?: string; category?: string; account?: string; tag?: string; group?: string }>()
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const queued = useOutbox((s) => s.items)

  // Deep links from Home, a category, an account or a tag set the filters once.
  useEffect(() => {
    const p: Partial<typeof f> = {}
    if (params.when === 'upcoming' && t.b) { p.start = t.b.today; p.sort = 'date'; p.dir = 'asc' }
    if (params.category) p.category = Number(params.category)
    if (params.account) p.account = Number(params.account)
    if (params.tag) p.tag = params.tag
    if (params.group) p.group = params.group
    if (Object.keys(p).length) set(p)
  }, [params.when, params.category, params.account, params.tag, params.group, t.b?.today]) // eslint-disable-line react-hooks/exhaustive-deps

  const query = toQuery(f)
  const q = useInfiniteQuery({
    queryKey: ['transactions', 'feed', query],
    queryFn: ({ pageParam }) => api.transactions({ ...query, limit: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (pages.length * PAGE < last.total ? pages.length * PAGE : undefined),
    // A new filter or search keeps the current list up until its results land, instead of flashing the skeleton.
    placeholderData: keepPreviousData,
  })
  const pull = usePullRefresh(() => Promise.all([q.refetch(), t.q.refetch()]))
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data])
  const first = q.data?.pages[0]

  const items = useMemo<Item[]>(() => {
    if (f.sort === 'amount') return rows.map((r, i) => ({ kind: 'row', key: `r${r.id}`, t: r, first: i === 0, last: i === rows.length - 1 }))
    const out: Item[] = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (i === 0 || rows[i - 1].date !== r.date) {
        const day = rows.filter((x) => x.date === r.date)
        out.push({ kind: 'head', key: `h${r.date}`, date: r.date, spent: day.reduce((n, x) => n + (t.typeOf(x) === 'Spending' ? x.amount : 0), 0) })
      }
      out.push({ kind: 'row', key: `r${r.id}`, t: r, first: i === 0 || rows[i - 1].date !== r.date, last: i === rows.length - 1 || rows[i + 1].date !== r.date })
    }
    return out
  }, [rows, f.sort, t])

  const filtered = !!(f.q || f.type || extraCount(f))
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
    sel.set(withTiming(0, { duration: 240, easing: Easing.bezier(0.23, 1, 0.32, 1) }))
  }
  const chosen = rows.filter((r) => picked.has(r.id))

  const header = (
    <View style={{ gap: space.m, paddingBottom: space.s }}>
      <Glow />
      {process.env.EXPO_OS === 'web' && (
        <View style={{ height: 40, borderRadius: radius.input, backgroundColor: c.fill, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.m, gap: space.s, marginHorizontal: space.l }}>
          <Icon sf="magnifyingglass" md="search" size={16} color={c.label2} />
          <TextInput placeholder="Search entries, notes, tags, amounts" placeholderTextColor={c.label2} value={f.q} onChangeText={(q) => set({ q })}
            style={{ flex: 1, fontSize: 17, color: c.label }} />
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l }}>
        {TYPES.map(([ty, label]) => <Chip key={label} label={label} selected={f.type === ty} onPress={() => set({ type: ty })} />)}
      </ScrollView>
      {queued.length > 0 && (
        <View style={{ marginHorizontal: space.l, padding: space.m, borderRadius: radius.input, backgroundColor: c.panel, flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
          <Icon sf="icloud.and.arrow.up" md="cloud_upload" size={16} color={c.warn} />
          <Txt variant="sub" style={{ flex: 1 }}>{queued.length === 1 ? '1 entry is' : `${queued.length} entries are`} {"waiting to reach Tally. They'll send when you're back on Tailscale."}</Txt>
        </View>
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
          {first.by_type.Spending != null && <Sum label="Spent" cents={first.by_type.Spending} />}
          {first.by_type['Money in'] != null && <Sum label="Money in" cents={first.by_type['Money in']} pos />}
        </View>
      )}
    </View>
  )

  return (
    <>
      {process.env.EXPO_OS !== 'web' && (
        <Stack.SearchBar placeholder="Entries, notes, tags, amounts" onChangeText={(e) => set({ q: e.nativeEvent.text })}
          onCancelButtonPress={() => set({ q: '' })} hideWhenScrolling={false} />
      )}
      {/* Buttons are direct children (arrays, not a fragment): the native toolbar silently drops a fragment. */}
      <Stack.Toolbar placement="right">
        {selecting ? [
          <Stack.Toolbar.Button key="done" variant="done" onPress={endSelect}>Done</Stack.Toolbar.Button>,
        ] : [
          <Stack.Toolbar.Button key="filters" icon={extra ? 'line.3.horizontal.decrease.circle.fill' : 'line.3.horizontal.decrease.circle'}
            accessibilityLabel={extra ? `Filters, ${extra} on` : 'Filters'} onPress={() => router.push('/filters')} />,
          <Stack.Toolbar.Button key="select" icon="checkmark.circle" accessibilityLabel="Select entries" onPress={startSelect} />,
        ]}
      </Stack.Toolbar>
      <View style={{ flex: 1, backgroundColor: c.bg }} collapsable={false}>
        <FlashList
          data={t.b ? items : []}
          keyExtractor={(it) => it.key}
          getItemType={(it) => it.kind}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: selecting ? 200 : 120 }}
          extraData={picked}
          onScrollBeginDrag={closeSwipes}
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
            if (item.kind === 'head') {
              return (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: space.l + space.xs, paddingTop: space.l, paddingBottom: space.s }}>
                  <Txt variant="headline">{dayLabel(item.date, t.b!.today)}</Txt>
                  {item.spent > 0 && <Txt variant="sub" tone="label2" num>{formatCents(item.spent)} spent</Txt>}
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
                <TxnRow t={r} c={t.catOf(r)} acct={t.acct} mark={t.markFor(r.what)} today={t.b!.today}
                  showDate={f.sort === 'amount' ? dayLabel(r.date, t.b!.today) : undefined}
                  sel={sel} selected={picked.has(r.id)} onSelect={selecting ? toggle : undefined}
                  padTop={item.first ? space.xs : 0} padBottom={item.last ? space.xs : 0} />
              </View>
            )
          }}
        />
        {selecting && <SelectionBar chosen={chosen} onDone={endSelect} />}
      </View>
    </>
  )
}

/** The hairline between rows, inset to the text; it follows the text over when select mode slides the checks in. */
function Divider({ sel }: { sel: SharedValue<number> }) {
  const { c } = useTheme()
  const style = useAnimatedStyle(() => ({ marginLeft: space.l + 40 + space.m + sel.get() * 34 }))
  return <Animated.View style={[{ height: 0.5, backgroundColor: c.sep }, style]} />
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
        {filtered ? 'Try fewer filters, or search for part of a name, a note, a tag or an amount.' : 'Tap + to add your first entry.'}
      </Txt>
    </View>
  )
}

/** Bulk actions for selected rows: recategorize, tag, delete (with undo). */
function SelectionBar({ chosen, onDone }: { chosen: Txn[]; onDone: () => void }) {
  const { c } = useTheme()
  const n = chosen.length
  const act = (fn: () => void) => () => { if (n) fn() }
  return (
    <Animated.View entering={SlideInDown.duration(320).easing(Easing.bezier(0.23, 1, 0.32, 1))} exiting={SlideOutDown.duration(220)}
      style={{ position: 'absolute', left: space.l, right: space.l, bottom: 100, borderRadius: radius.panel, borderCurve: 'continuous', backgroundColor: c.panelRaised, padding: space.m, gap: space.s, boxShadow: '0 8px 30px rgba(0,0,0,0.18)' }}>
      <Txt variant="sub" tone="label2" style={{ textAlign: 'center' }}>{n ? `${n} selected` : 'Tap entries to select them'}</Txt>
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <BarBtn label="Category" sf="square.grid.2x2" md="category" disabled={!n}
          onPress={act(() => router.push({ pathname: '/pick', params: { kind: 'bulk-category', ids: chosen.map((x) => x.id).join(',') } }))} />
        <BarBtn label="Tag" sf="number" md="tag" disabled={!n}
          onPress={act(() => router.push({ pathname: '/pick', params: { kind: 'bulk-tag', ids: chosen.map((x) => x.id).join(',') } }))} />
        <BarBtn label="Delete" sf="trash" md="delete" destructive disabled={!n} onPress={act(() => { deleteTxns(chosen); onDone() })} />
      </View>
    </Animated.View>
  )
}

function BarBtn({ label, sf, md, onPress, destructive, disabled }: { label: string; sf: 'trash'; md: string; onPress: () => void; destructive?: boolean; disabled?: boolean } | { label: string; sf: 'square.grid.2x2' | 'number'; md: string; onPress: () => void; destructive?: boolean; disabled?: boolean }) {
  const { c } = useTheme()
  const color = destructive ? c.neg : c.label
  return (
    <Tap onPress={onPress} disabled={disabled} style={{ flex: 1, height: 52, borderRadius: radius.input, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center', gap: 2, opacity: disabled ? 0.4 : 1 }}>
      <Icon sf={sf} md={md} size={17} color={color} />
      <Txt variant="foot" style={{ color }}>{label}</Txt>
    </Tap>
  )
}
