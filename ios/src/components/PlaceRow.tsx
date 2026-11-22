// A category's mark, and a past place as "What was it?" lists it in the composer and in Catch up.
import { categoryVisual } from '@/icons/categories'
import type { Txn } from '@/lib/api'
import { useTally } from '@/lib/tally'
import { rowAmount } from '@/lib/txn'
import { useTheme } from '@/theme'
import { Mark } from './Mark'
import { Money } from './Money'
import { Row } from './Row'

export function CatMark({ id, size = 30 }: { id: number; size?: number }) {
  const t = useTally()
  const { tint } = useTheme()
  const x = t.cat.get(id)
  if (!x) return null
  const v = categoryVisual(x)
  return <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={size} />
}

/** A past place with its last amount, signed as Activity signs it: a refund is a green +. */
export function PlaceRow({ x, sub, onPress }: { x: Txn; sub: string; onPress: () => void }) {
  const t = useTally()
  const a = rowAmount(t.catOf(x).type, x.amount)
  return <Row label={x.what} sub={sub} chevron={false} onPress={onPress} leading={<CatMark id={x.category_id} />}
    value={<Money cents={a.cents} sign={a.sign} tone={a.tone} muted variant="callout" />} />
}
