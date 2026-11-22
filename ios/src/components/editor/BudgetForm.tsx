// The budget editor a category page's gauge opens: the regular amount, or a one-off for this month or next, like
// Settings → Budgets (it used to offer only "Just this month").
import { Segmented } from '@/components/native/Segmented'
import { Group } from '@/components/Row'
import { Txt } from '@/components/Txt'
import type { AdminData } from '@/lib/api'
import { fromISO } from '@/lib/dates'
import { budgetIn, budgetMode, budgetMonths, budgetText, dollarsText, type BudgetMode, type Form } from '@/lib/forms'
import { formatCents } from '@/lib/money'
import { space } from '@/theme'
import { Field } from './Fields'

const monthName = (m: string) => fromISO(m).toLocaleDateString('en-US', { month: 'long' })

/** Switching keeps an amount you've typed (type 400, then pick December), and otherwise shows the one already set. */
export function BudgetForm({ f, set, a, id, today }: { f: Form; set: (p: Form) => void; a: AdminData; id: number; today: string }) {
  const x = a.categories.find((r) => r.id === id)
  const months = budgetMonths(today)
  const mode = budgetMode(f)
  const regular = x?.budget ?? null
  const switchTo = (m: BudgetMode) => {
    const typed = String(f.amount ?? '') !== budgetText(a, id, mode, today)
    // null, not false: an untouched form still reads as unchanged when it's closed.
    set({ thisMonth: m === 'this', nextMonth: m === 'next' ? true : null, ...(typed ? {} : { amount: budgetText(a, id, m, today) }) })
  }
  const dollars = (v: number) => formatCents(v, { cents: false })
  const oneOffs = (['this', 'next'] as const).flatMap((m) => {
    const v = budgetIn(a, id, months[m]).over
    return v != null ? [`${monthName(months[m])} (${dollars(v)})`] : []
  })
  const footer = mode === 'regular'
    ? `Every month uses this amount${oneOffs.length ? `, except ${oneOffs.join(' and ')}` : ' unless it has a one-off'}.`
    : `Only ${monthName(months[mode])} uses this amount. ${regular != null ? `Other months keep the regular ${dollars(regular)}; leave it empty to use that.` : 'Other months have no budget.'}`
  return (
    <>
      <Txt variant="title2" style={{ paddingHorizontal: space.xs }}>{x?.name}</Txt>
      <Segmented options={[['regular', 'Regular'], ['this', monthName(months.this)], ['next', monthName(months.next)]]} value={mode} onChange={switchTo} />
      <Group footer={footer}>
        <Field label={mode === 'regular' ? 'Per month' : `In ${monthName(months[mode])}`} value={String(f.amount ?? '')} onChange={(v) => set({ amount: v })} money
          placeholder={mode !== 'regular' && regular != null ? dollarsText(regular) : 'None'} />
      </Group>
    </>
  )
}
