// Category and From/To pickers for the quick action and recurring editors. Hidden items only show when they're the
// current value, named "(hidden)".
import { Mark } from '@/components/Mark'
import { categoryVisual } from '@/icons/categories'
import type { AdminData, CatType } from '@/lib/api'
import type { Form } from '@/lib/forms'
import { SHAPES } from '@/lib/shapes'
import { useTheme } from '@/theme'
import { Choice, withHidden } from './Fields'

/** Picking a category also clears a From/To its type doesn't use: the row is hidden then, so a leftover account
 *  made Save fail with a message the screen gave no way to act on. */
function pickCategory(a: AdminData, v: number | null): Form {
  const type = a.categories.find((x) => x.id === v)?.type ?? 'Spending'
  const s = SHAPES[type]
  return { category_id: v, ...(s.from === 'blank' ? { from_account_id: null } : {}), ...(s.to === 'blank' ? { to_account_id: null } : {}) }
}

/** The category row and the From/To rows its type uses. */
export function Pickers({ f, set, a }: { f: Form; set: (p: Form) => void; a: AdminData }) {
  const { tint } = useTheme()
  const cur = (f.category_id as number | null) ?? null
  const type: CatType = a.categories.find((x) => x.id === cur)?.type ?? 'Spending'
  const s = SHAPES[type]
  const cats = withHidden(a.categories, cur, (x, label) => {
    const v = categoryVisual(x)
    return { value: x.id, label, leading: <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={26} /> }
  })
  const accts = (current: number | null, optional: boolean) => {
    const list = withHidden(a.accounts, current, (x, label) => ({ value: x.id, label }))
    return optional ? [{ value: null, label: 'None' }, ...list] : list
  }
  const from = (f.from_account_id as number | null) ?? null
  const to = (f.to_account_id as number | null) ?? null
  return (
    <>
      <Choice label="Category" value={cur} options={cats} onChange={(v) => set(pickCategory(a, v))} />
      {s.from !== 'blank' && <Choice label="From" value={from} options={accts(from, s.from === 'optional')} onChange={(v) => set({ from_account_id: v })} />}
      {s.to !== 'blank' && <Choice label={s.to === 'optional' ? 'To (optional)' : 'To'} value={to} options={accts(to, s.to === 'optional')} onChange={(v) => set({ to_account_id: v })} />}
    </>
  )
}
