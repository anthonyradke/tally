// The new-entry composer's review page and its row of quick actions (app/new.tsx holds the flow).
import { ScrollView, View } from 'react-native'
import type { Favorite } from '@/lib/api'
import { KIND_NAME, signed } from '@/lib/compose'
import { toCents, useDraft } from '@/lib/draft'
import { SHAPES } from '@/lib/shapes'
import type { Step } from '@/lib/steps'
import { useTally } from '@/lib/tally'
import { radius, space, useTheme } from '@/theme'
import { categoryVisual } from '@/icons/categories'
import { Chip } from './Chip'
import { CatMark, Extras } from './ComposerSteps'
import { DateStrip } from './DateStrip'
import { Mark } from './Mark'
import { Group, Row } from './Row'
import { Tap } from './Tap'
import { Txt } from './Txt'

/** The quick action chips on the amount page. */
export function QuickChips({ list, quick, onPick }: { list: Favorite[]; quick: number | null; onPick: (id: number) => void }) {
  const t = useTally()
  const { tint } = useTheme()
  if (!list.length) return null
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.l, flexGrow: 0 }} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l }}>
      {list.map((f) => {
        const fc = t.cat.get(f.category_id)
        const fv = fc ? categoryVisual({ ...fc, icon: f.icon ?? fc.icon, color: f.color ?? fc.color }) : null
        return <Chip key={f.id} label={f.label} selected={quick === f.id} onPress={() => onPick(f.id)}
          leading={fv ? <Mark kind="glyph" sf={fv.sf} md={fv.md} tint={tint(fv.tint)} size={28} /> : undefined} />
      })}
    </ScrollView>
  )
}

/** The last page: every answer as a row that jumps back to its step, the date, the extras and any errors. */
export function Review({ onGo, onSplit, errors }: { onGo: (s: Step) => void; onSplit: () => void; errors: string[] }) {
  const { c } = useTheme()
  const t = useTally()
  const { d } = useDraft()
  const cat = d.category_id ? t.cat.get(d.category_id) : undefined
  const shape = SHAPES[d.kind]
  const figure = signed(toCents(d.amount), d.kind, d.refund)
  return (
    <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.l }}>
      <Tap feedback="opacity" onPress={() => onGo('amount')} style={{ alignItems: 'center', paddingVertical: space.s }} accessibilityLabel={`Amount ${figure.text}. Change`}>
        <Txt style={{ fontSize: 44, fontWeight: '700', letterSpacing: -1.2, color: figure.tone === 'pos' ? c.pos : figure.tone === 'neg' ? c.neg : c.label }}>{figure.text}</Txt>
        <Txt variant="callout" tone="label2">{d.refund && d.kind === 'Spending' ? 'Refund' : KIND_NAME[d.kind]}</Txt>
      </Tap>
      <Group>
        <Row label={d.kind === 'Money in' ? 'From' : 'What'} value={d.what || 'Add a name'} sf="text.alignleft" md="notes" onPress={() => onGo('what')} />
        <Row label="Category" value={cat?.name ?? 'Choose'} onPress={() => onGo('category')}
          leading={cat ? (
            // The mark sits in the icons' 18 pt column, so "Category" lines up with What and From.
            <View style={{ width: 18, alignItems: 'center', overflow: 'visible' }}><CatMark id={cat.id} size={24} /></View>
          ) : undefined} sf={cat ? undefined : 'square.grid.2x2'} md={cat ? undefined : 'category'} />
        {shape.from !== 'blank' && <Row label="From" value={d.from_id ? t.acct.get(d.from_id)?.name : 'Choose'} sf="arrow.up.right" md="north_east" onPress={() => onGo('from')} />}
        {shape.to !== 'blank' && <Row label="To" value={d.to_id ? t.acct.get(d.to_id)?.name : shape.to === 'optional' ? 'None' : 'Choose'} sf="arrow.down.left" md="south_west" onPress={() => onGo('to')} />}
      </Group>
      <DateStrip />
      <Extras onSplit={onSplit} />
      {errors.length > 0 && (
        <View style={{ padding: space.m, borderRadius: radius.input, backgroundColor: c.panel, gap: 4 }} accessibilityLiveRegion="assertive">
          {errors.map((e) => <Txt key={e} variant="callout" tone="neg">{e}</Txt>)}
        </View>
      )}
    </ScrollView>
  )
}
