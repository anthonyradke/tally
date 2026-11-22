// Activity's chip rows, as set up in Settings > Activity filters. Tapping a chip picks it; each row's first chip lets go.
import { Children, useEffect, useRef, type ReactNode } from 'react'
import { ScrollView, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { AccountMark } from '@/components/AccountMark'
import { Chip } from '@/components/Chip'
import { Icon } from '@/components/Icon'
import { Mark } from '@/components/Mark'
import { Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { categoryVisual } from '@/icons/categories'
import type { CatType } from '@/lib/api'
import { activeRange, bar, pills, ranges, SORTS, type BarRow } from '@/lib/filterBar'
import { fromViewQuery, namedView, useFilters, type Filters } from '@/lib/filters'
import { useTally } from '@/lib/tally'
import { radius, space, useTheme } from '@/theme'

const ANY: Partial<Record<BarRow, string>> = { type: 'All', account: 'Any account', category: 'Any category', when: 'All time' }

export function FilterBar() {
  const t = useTally()
  const { tint } = useTheme()
  const { f, set } = useFilters()
  if (!t.b) return null
  const b = t.b
  const when = new Map(ranges(b.today).map(([k, , p]) => [k as string, p]))
  const sorts = new Map(SORTS.map(([k, , p]) => [k, p]))
  const pick = (row: BarRow, id: string | null): Partial<Filters> => {
    switch (row) {
      case 'type': return { type: (id ?? '') as CatType | '' }
      case 'account': return { account: id == null ? undefined : Number(id) }
      case 'category': return { category: id == null ? undefined : Number(id) }
      case 'when': return when.get(id ?? 'all')!
      case 'sort': return sorts.get(id ?? 'newest')!
    }
  }
  const picked = (row: BarRow): string | null => {
    switch (row) {
      case 'type': return f.type || null
      case 'account': return f.account != null ? String(f.account) : null
      case 'category': return f.category != null ? String(f.category) : null
      case 'when': { const r = activeRange(f, b.today); return r === 'all' ? null : r ?? 'custom' } // a custom range lights no chip, not All time
      case 'sort': return SORTS.find(([, , x]) => x.sort === f.sort && x.dir === f.dir)?.[0] ?? null // no "any" chip: Newest lights up
    }
  }
  const lead = (row: BarRow, id: string) => {
    if (row === 'account') { const a = t.acct.get(Number(id)); return a ? <AccountMark a={a} size={28} /> : undefined }
    if (row === 'category') { const x = t.cat.get(Number(id)); if (!x) return undefined; const v = categoryVisual(x); return <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={28} /> }
    return undefined
  }
  return (
    <>
      {bar(b, f).filter((r) => r.chips.length > 0).map(({ row, chips }) => {
        const on = picked(row)
        const any = ANY[row]
        const focus = on == null ? 0 : chips.findIndex((c) => c.id === on) + (any ? 1 : 0)
        return (
          <ChipRow key={row} focus={focus}>
            {any && <Chip key="any" label={any} selected={on == null} onPress={() => set(pick(row, null))} />}
            {chips.map((c) => <Chip key={c.id} label={c.label} selected={on === c.id} leading={lead(row, c.id)} onPress={() => set(pick(row, c.id))} />)}
          </ChipRow>
        )
      })}
      <Pills />
    </>
  )
}

/** The filters on with no chip lit for them (a row switched off in Settings, a tag, a day from Insights), so none is
 *  ever on out of sight. Tapping one takes it off. A saved view that's on leads the row by name (tapping it takes the
 *  whole view off); once the filters move on from it, it stays as a plain pill that puts it back on. */
function Pills() {
  const t = useTally()
  const { c } = useTheme()
  const { f, set, view, reset } = useFilters()
  const list = t.b ? pills(t.b, f) : []
  const named = t.b ? namedView(t.b.saved_views, f, view, t.b.today) : undefined
  if (!list.length && !named) return null
  const apply = () => {
    Haptics.selectionAsync().catch(() => {})
    if (!named || !t.b) return
    if (named.on) reset()
    else useFilters.getState().replace(fromViewQuery(named.v.query, t.b.today), named.v.id)
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, paddingHorizontal: space.l }}>
      {named && (
        <Animated.View key={`view${named.v.id}`} entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} layout={LinearTransition.duration(200)}>
          <Tap onPress={apply} accessibilityLabel={named.on ? `${named.v.name}, saved view. Clear filters` : `Saved view ${named.v.name}. Put it back on`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, height: 30, paddingLeft: space.s + 2, paddingRight: named.on ? space.s + 2 : space.m, borderRadius: radius.pill, backgroundColor: named.on ? c.ink : c.panel }}>
            <Icon sf={named.on ? 'bookmark.fill' : 'bookmark'} md="bookmark" size={12} color={named.on ? c.onInk : c.label2} />
            <Txt variant="sub" tone={named.on ? 'onInk' : 'label'} style={{ fontWeight: '600' }} numberOfLines={1}>{named.v.name}</Txt>
            {named.on && <Icon sf="xmark" md="close" size={10} color={c.onInk} weight="bold" />}
          </Tap>
        </Animated.View>
      )}
      {list.map((p) => (
        <Animated.View key={p.key} entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} layout={LinearTransition.duration(200)}>
          <Tap onPress={() => { Haptics.selectionAsync().catch(() => {}); set(p.clear) }} accessibilityLabel={`${p.label}. Remove filter`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, height: 30, paddingLeft: space.m, paddingRight: space.s + 2, borderRadius: radius.pill, backgroundColor: c.ink }}>
            <Txt variant="sub" tone="onInk" style={{ fontWeight: '600' }} numberOfLines={1}>{p.label}</Txt>
            <Icon sf="xmark" md="close" size={10} color={c.onInk} weight="bold" />
          </Tap>
        </Animated.View>
      ))}
    </View>
  )
}

/** A sideways row of chips that scrolls just far enough to keep the picked one (`focus`, a child's index) in view,
 *  so a filter set from a link or a saved view never sits lit off the edge. */
function ChipRow({ focus, children }: { focus: number; children: ReactNode }) {
  const ref = useRef<ScrollView>(null)
  const frames = useRef<{ x: number; w: number }[]>([])
  const view = useRef({ x: 0, w: 0 })
  const reveal = (i: number) => {
    const fr = frames.current[i]
    const { x, w } = view.current
    if (!fr || !w) return
    if (fr.x - space.l < x) ref.current?.scrollTo({ x: Math.max(0, fr.x - space.l), animated: true })
    else if (fr.x + fr.w + space.l > x + w) ref.current?.scrollTo({ x: fr.x + fr.w + space.l - w, animated: true })
  }
  useEffect(() => reveal(focus), [focus])
  return (
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l }}
      scrollEventThrottle={32} onScroll={(e) => { view.current.x = e.nativeEvent.contentOffset.x }}
      onLayout={(e) => { view.current.w = e.nativeEvent.layout.width; reveal(focus) }}>
      {Children.toArray(children).map((chip, i) => (
        <View key={i} onLayout={(e) => { const { x, width } = e.nativeEvent.layout; frames.current[i] = { x, w: width }; if (i === focus) reveal(i) }}>{chip}</View>
      ))}
    </ScrollView>
  )
}
