// One form sheet for every short choice: a category, an account, a date, and the bulk actions from Activity.
// It edits the draft store directly and dismisses; the screen underneath re-renders.
import { useState } from 'react'
import { ScrollView, TextInput, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Icon } from '@/components/Icon'
import { Mark } from '@/components/Mark'
import { Money } from '@/components/Money'
import { DatePick } from '@/components/native/DatePick'
import { Group, Row } from '@/components/Row'
import { Button } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { categoryVisual, KIND_LABEL, KIND_SYMBOL } from '@/icons/categories'
import { api, ApiError, type CatType, type Kind } from '@/lib/api'
import { close } from '@/lib/nav'
import { invalidateAll } from '@/lib/data'
import { useDraft } from '@/lib/draft'
import { monthsNow } from '@/lib/months'
import { SHAPES } from '@/lib/shapes'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { space, useTheme } from '@/theme'

const TYPE_ORDER: CatType[] = ['Spending', 'Money in', 'Transfer', 'Saving', 'Loan']
const KIND_ORDER: Kind[] = ['cash', 'card', 'investment', 'loan']

export default function Pick() {
  const { kind, line, ids, current } = useLocalSearchParams<{ kind: string; line?: string; ids?: string; current?: string }>()
  const { c } = useTheme()
  const title = { category: 'Category', from: 'From', to: 'To', date: 'Date', 'bulk-category': ids?.includes(',') ? 'Move to category' : 'Category', 'bulk-tag': 'Add a tag' }[kind] ?? ''
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, paddingTop: space.xl, gap: space.l, paddingBottom: 48 }} style={{ backgroundColor: c.bg }}>
      <Txt variant="title2" accessibilityRole="header" style={{ paddingHorizontal: space.xs }}>{title}</Txt>
      {(kind === 'category' || kind === 'bulk-category') && <Categories line={line} ids={ids} checked={current ? Number(current) : undefined} />}
      {(kind === 'from' || kind === 'to') && <Accounts side={kind} />}
      {kind === 'date' && <DateSheet />}
      {kind === 'bulk-tag' && <BulkTag ids={ids ?? ''} />}
    </ScrollView>
  )
}

function done() {
  Haptics.selectionAsync().catch(() => {})
  close()
}

function Categories({ line, ids, checked }: { line?: string; ids?: string; checked?: number }) {
  const t = useTally()
  const { tint, c } = useTheme()
  const { d, set, setLine } = useDraft()
  if (!t.b) return null
  const bulk = !!ids
  // In the composer, the kind chosen up top goes first; a split line only takes spending.
  const order = bulk ? TYPE_ORDER : [d.kind, ...TYPE_ORDER.filter((x) => x !== d.kind)]
  const types = line ? ['Spending' as CatType] : order
  // Bulk moves check the entry's own category when there's just one; the draft has nothing to do with them.
  const current = bulk ? checked : line ? d.split?.find((l) => l.key === line)?.category_id : d.category_id
  const choose = async (id: number, type: CatType) => {
    if (bulk) {
      try {
        const r = await api.bulk({ ids: ids!.split(',').map(Number), action: 'recategorize', category_id: id })
        await invalidateAll()
        toast({ text: `Moved ${r.count === 1 ? '1 entry' : `${r.count} entries`}` })
      } catch (e) { toast({ text: e instanceof ApiError ? e.errors.join(' ') : 'Tally is unreachable.', tone: 'error' }) }
      return done()
    }
    if (line) setLine(line, { category_id: id })
    else {
      const s = SHAPES[type]
      set({ category_id: id, kind: type, from_id: s.from === 'blank' ? null : d.from_id, to_id: s.to === 'blank' ? null : d.to_id })
    }
    done()
  }
  return (
    <>
      {types.map((ty) => {
        const cats = t.b!.categories.filter((x) => x.type === ty && (x.active || x.id === current))
        if (!cats.length) return null
        return (
          <Group key={ty} header={ty}>
            {cats.map((x) => {
              const v = categoryVisual(x)
              return (
                <Row key={x.id} label={x.name} onPress={() => choose(x.id, x.type)} chevron={false}
                  leading={<Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={30} />}
                  trailing={x.id === current ? <Icon sf="checkmark" md="check" size={16} color={c.ink} weight="bold" /> : undefined} />
              )
            })}
          </Group>
        )
      })}
    </>
  )
}

function Accounts({ side }: { side: 'from' | 'to' }) {
  const t = useTally()
  const { c, bank } = useTheme()
  const { d, set } = useDraft()
  if (!t.b) return null
  const bal = monthsNow(t.b).cur?.balances ?? {}
  const current = side === 'from' ? d.from_id : d.to_id
  const optional = SHAPES[d.kind][side] === 'optional'
  const choose = (id: number | null) => { set(side === 'from' ? { from_id: id } : { to_id: id }); done() }
  return (
    <>
      {optional && (
        <Group><Row label="None" onPress={() => choose(null)} chevron={false} trailing={current == null ? <Icon sf="checkmark" md="check" size={16} color={c.ink} weight="bold" /> : undefined} /></Group>
      )}
      {KIND_ORDER.map((k) => {
        const list = t.b!.accounts.filter((a) => a.kind === k && (a.active || a.id === current))
        if (!list.length) return null
        return (
          <Group key={k} header={KIND_LABEL[k]}>
            {list.map((a) => (
              <Row key={a.id} label={a.name} onPress={() => choose(a.id)} chevron={false}
                leading={<Mark kind="glyph" sf={KIND_SYMBOL[a.kind][0]} md={KIND_SYMBOL[a.kind][1]} tint={bank(a.bank ?? (a.kind === 'investment' ? 'roth' : 'hsa'))} size={30} />}
                value={<Money cents={bal[String(a.id)] ?? a.start_balance} tone="neutral" muted variant="callout" />}
                trailing={a.id === current ? <Icon sf="checkmark" md="check" size={16} color={c.ink} weight="bold" /> : <View style={{ width: 16 }} />} />
            ))}
          </Group>
        )
      })}
    </>
  )
}

function DateSheet() {
  const { d, set } = useDraft()
  return (
    <View style={{ gap: space.l }}>
      <DatePick value={d.date} onChange={(date) => set({ date })} />
      <Button label="Done" onPress={done} />
    </View>
  )
}

function BulkTag({ ids }: { ids: string }) {
  const { c } = useTheme()
  const [tag, setTag] = useState('')
  const apply = async () => {
    const tags = tag.split(/\s+/).map((x) => x.replace(/^#/, '').toLowerCase()).filter(Boolean)
    if (!tags.length) return
    try {
      const r = await api.bulk({ ids: ids.split(',').map(Number), action: 'tag', tags })
      await invalidateAll()
      toast({ text: `Tagged ${r.count === 1 ? '1 entry' : `${r.count} entries`}` })
    } catch (e) { toast({ text: e instanceof ApiError ? e.errors.join(' ') : 'Tally is unreachable.', tone: 'error' }) }
    done()
  }
  return (
    <View style={{ gap: space.l }}>
      <TextInput autoFocus value={tag} onChangeText={setTag} placeholder="trip, gift, work" placeholderTextColor={c.label3} autoCapitalize="none"
        autoCorrect={false} onSubmitEditing={apply} returnKeyType="done"
        style={{ height: 50, borderRadius: 12, backgroundColor: c.panel, paddingHorizontal: space.l, fontSize: 17, color: c.label }} />
      <Button label="Add tag" onPress={apply} disabled={!tag.trim()} />
    </View>
  )
}
