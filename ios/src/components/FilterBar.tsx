// Activity's chip rows, as set up in Settings > Activity filters. Tapping a chip picks it; each row's first chip lets go.
import { Children, useEffect, useRef, type ReactNode } from 'react'
import { ScrollView, View } from 'react-native'
import { AccountMark } from '@/components/AccountMark'
import { Chip } from '@/components/Chip'
import { Mark } from '@/components/Mark'
import { categoryVisual } from '@/icons/categories'
import type { CatType } from '@/lib/api'
import { activeRange, bar, ranges, SORTS, type BarRow } from '@/lib/filterBar'
import { useFilters, type Filters } from '@/lib/filters'
import { useTally } from '@/lib/tally'
import { space, useTheme } from '@/theme'

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
      case 'when': { const r = activeRange(f, b.today); return r === 'all' ? null : r }
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
    </>
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
