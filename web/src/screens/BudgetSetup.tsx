import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useBootstrap } from '@/lib/data'
import { suggestBudgets } from '@/lib/budgets'
import { formatCents, parseDollars } from '@/lib/money'
import { fromISO, monthOf } from '@/lib/dates'
import { categoryVisual } from '@/icons/categories'
import { Sheet } from '@/components/Sheet'
import { Mark } from '@/components/Mark'
import { useToast } from '@/components/Toast'
import s from './BudgetSetup.module.css'

const toField = (c: number | null) => (!c ? '' : c % 100 ? (c / 100).toFixed(2) : String(c / 100))

/** "Suggest budgets": every spending category with a monthly target prefilled from its recent average. Categories
 *  that already have a budget keep it; an empty field means no budget. `trigger` renders whatever opens it. */
export function BudgetSetup({ trigger }: { trigger: (open: () => void) => ReactNode }) {
  const b = useBootstrap().data
  const qc = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<number, string>>({})
  const [errors, setErrors] = useState<string[]>([])
  const rows = b ? suggestBudgets(b) : []
  const others = b ? b.categories.filter((c) => c.active && c.type === 'Spending' && !rows.some((r) => r.c.id === c.id)) : []

  useEffect(() => {
    if (!open || !b) return
    const v: Record<number, string> = {}
    for (const r of rows) v[r.c.id] = toField(r.c.budget ?? r.suggested)
    for (const c of others) v[c.id] = toField(c.budget)
    setValues(v); setErrors([])
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const changes = [...rows.map((r) => r.c), ...others]
    .map((c) => ({ c, next: parseDollars(values[c.id] ?? '') }))
    .filter(({ c, next }) => (next || null) !== (c.budget || null))
  const save = useMutation({
    mutationFn: () => Promise.all(changes.map(({ c, next }) => api.setBudget(c.id, next || null))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bootstrap'] }); qc.invalidateQueries({ queryKey: ['admin'] })
      setOpen(false); toast.show({ message: `Budgets saved for ${changes.length} ${changes.length === 1 ? 'category' : 'categories'}` })
    },
    onError: (e) => setErrors(e instanceof ApiError ? e.errors : [String(e)]),
  })

  const span = rows[0]?.months ?? 0
  const lastDone = b && b.months.filter((m) => m.month < monthOf(b.today)).at(-1)?.month
  const basis = !lastDone ? '' : span === 1 ? fromISO(lastDone).toLocaleDateString('en-US', { month: 'long' }) : `the last ${span} months`
  const line = (id: number, name: string, color: string, Icon: ReturnType<typeof categoryVisual>['Icon'], hint: string) => (
    <li key={id} className={s.row}>
      <Mark Icon={Icon} color={color} size="sm" />
      <span className={s.text}><span className={s.name}>{name}</span><span className="secondary tnum">{hint}</span></span>
      <label className={s.field}>
        <span className={s.cur}>$</span>
        <input className="tnum" inputMode="decimal" placeholder="None" value={values[id] ?? ''} aria-label={`${name} monthly budget`}
          onChange={(e) => setValues({ ...values, [id]: e.target.value })} />
      </label>
    </li>
  )

  return (
    <>
      {trigger(() => setOpen(true))}
      <Sheet open={open} onClose={() => setOpen(false)} title="Monthly budgets" tall
        action={<button type="button" className={`${s.save} ${changes.length ? '' : s.off}`} disabled={!changes.length || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button>}>
        <div className={s.body}>
          {errors.length > 0 && <div className={s.errors} role="alert">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
          <p className="secondary">{rows.length
            ? `Suggested from what you spent in ${basis}, rounded up to the next $10. Categories that already have a budget keep it. Clear a field for no budget.`
            : 'Suggestions appear once a full month is logged. You can still set targets by hand.'}</p>
          {rows.length > 0 && <ul className={s.list}>
            {rows.map(({ c, average }) => { const v = categoryVisual(c); return line(c.id, c.name, v.color, v.Icon, `Averages ${formatCents(average, { cents: false })} a month`) })}
          </ul>}
          {others.length > 0 && <ul className={s.list}>
            {others.map((c) => { const v = categoryVisual(c); return line(c.id, c.name, v.color, v.Icon, 'No recent spending') })}
          </ul>}
        </div>
      </Sheet>
    </>
  )
}
