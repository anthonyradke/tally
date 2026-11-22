// The editor's spending extras: refund, and splitting one purchase across categories. Each split line has its
// category and its own amount pill, which the keypad types into.
import { Switch, View } from 'react-native'
import { router } from 'expo-router'
import { categoryVisual } from '@/icons/categories'
import { fromCents, toCents, useDraft } from '@/lib/draft'
import { formatCents } from '@/lib/money'
import { useTally } from '@/lib/tally'
import { radius, space, useTheme } from '@/theme'
import { Mark } from './Mark'
import { Group, Row } from './Row'
import { Tap } from './Tap'
import { Txt } from './Txt'

/** `left`: cents of the total not in a line yet. `onAmount` opens the keypad on a line; `onSplit` runs once the split
 *  has started or stopped. */
export function SplitGroup({ canSplit, left, onAmount, onSplit }: { canSplit: boolean; left: number; onAmount: (key: string) => void; onSplit: (on: boolean) => void }) {
  const { c, tint } = useTheme()
  const t = useTally()
  const { d, set } = useDraft()
  // A new line opens the keypad on itself; Done then goes on to its category.
  const addLine = () => {
    const key = Math.random().toString(36).slice(2, 7)
    set({ split: [...d.split!, { key, category_id: null, amount: left > 0 ? fromCents(left) : '' }], target: key })
    onAmount(key)
  }
  return (
    <Group footer={d.split ? 'Each line is saved as its own entry, linked together, so budgets see the right categories.' : undefined}>
      <Row label="Refund" sub={d.refund ? 'Counts as money back in this category' : undefined} sf="arrow.uturn.backward" md="undo"
        trailing={<Switch value={d.refund} onValueChange={(refund) => set({ refund })} />} chevron={false} />
      {canSplit && (
        <Row label="Split across categories" sf="square.split.2x1" md="call_split" chevron={false}
          trailing={<Switch value={!!d.split} onValueChange={(on) => { set(on
            ? { split: [{ key: 'a', category_id: d.category_id, amount: d.amount }, { key: 'b', category_id: null, amount: '' }], target: 'b' }
            : { split: null, target: 'main' }); onSplit(on) }} />} />
      )}
      {d.split?.map((l, i) => {
        const lc = l.category_id ? t.cat.get(l.category_id) : undefined
        const lv = lc ? categoryVisual(lc) : null
        const active = d.target === l.key
        return (
          <Row key={l.key} label={lc?.name ?? `Line ${i + 1}`}
            leading={lv ? <Mark kind="glyph" sf={lv.sf} md={lv.md} tint={tint(lv.tint)} size={30} /> : <EmptyMark />}
            onPress={() => router.push({ pathname: '/pick', params: { kind: 'category', line: l.key } })}
            trailing={
              <Tap feedback="opacity" onPress={() => onAmount(l.key)} hitSlop={8} accessibilityLabel={`Amount for line ${i + 1}, ${formatCents(toCents(l.amount))}`}
                style={{ minWidth: 88, height: 34, borderRadius: radius.pill, paddingHorizontal: space.m, alignItems: 'flex-end', justifyContent: 'center', backgroundColor: active ? c.ink : c.fill }}>
                <Txt variant="callout" num tone={active ? 'onInk' : 'label'} style={{ fontWeight: '600' }}>{formatCents(toCents(l.amount))}</Txt>
              </Tap>
            } chevron={false} />
        )
      })}
      {d.split && <Row label="Add a line" sf="plus" md="add" chevron={false} onPress={addLine} />}
    </Group>
  )
}

/** Where a category's mark goes before one is picked. */
export function EmptyMark() {
  const { c } = useTheme()
  return <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: c.label3, borderStyle: 'dashed' }} />
}
