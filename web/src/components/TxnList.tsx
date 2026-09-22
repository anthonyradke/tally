import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError, type Bootstrap, type Txn } from '@/api/client'
import type { Lookups } from '@/lib/data'
import { useAdd } from '@/lib/add'
import { useMarkFor } from '@/lib/data'
import { useRecentIds } from '@/lib/recent'
import { groupByDay } from '@/lib/txn'
import { dayLabel, isFuture } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { TxnRow } from './TxnRow'
import { SwipeRow } from './SwipeRow'
import { useToast } from './Toast'
import s from './TxnList.module.css'

interface Props {
  items: Txn[]
  boot: Bootstrap
  lookups: Lookups
  onSelect?: (t: Txn) => void
  /** Show a day total (spending) in each day header. */
  dayTotals?: boolean
  /** Swipe left on a row for Duplicate / Delete (off inside selection mode). */
  swipe?: boolean
  /** Multi-select: the selected ids (present = selection mode) and toggle/enter handlers. */
  selection?: Set<number>
  onToggle?: (id: number) => void
  onLongPress?: (id: number) => void
}

// Long lists render the first rows at once and the rest just after the page transition, off the critical frame.
const FIRST = 24

export function TxnList({ items, boot, lookups, onSelect, dayTotals = true, swipe, selection, onToggle, onLongPress }: Props) {
  const [cap, setCap] = useState(() => (items.length > 40 ? FIRST : Infinity))
  useEffect(() => {
    if (cap === Infinity) return
    const id = window.setTimeout(() => setCap(Infinity), 420)
    return () => window.clearTimeout(id)
  }, [cap])
  const groups = groupByDay(items.length > cap ? items.slice(0, cap) : items, (t) => lookups.cat.get(t.category_id)?.type ?? 'Spending')
  const add = useAdd()
  const toast = useToast()
  const qc = useQueryClient()
  const refresh = () => { qc.invalidateQueries({ queryKey: ['transactions'] }); qc.invalidateQueries({ queryKey: ['bootstrap'] }) }
  const fail = (what: string) => (e: unknown) => toast.show({ message: `${what}: ${e instanceof ApiError ? e.errors.join(' ') : e}`, tone: 'error' })
  const remove = (t: Txn) => api.deleteTxn(t.id).then((gone) => {
    refresh()
    toast.show({ message: `Deleted ${formatCents(Math.abs(gone.amount))} · ${gone.what || lookups.cat.get(gone.category_id)?.name}`,
      action: { label: 'Undo', onClick: () => api.restore([gone]).then(refresh, fail("Couldn't undo")) } })
  }, fail("Couldn't delete"))
  // Layout animation measures every animated node on each render; worth it for short lists (Home panels, filtered
  // results), too costly for the full ledger on a 120 Hz frame budget.
  const animate = items.length <= 40
  const markFor = useMarkFor()
  const recent = useRecentIds()
  return (
    <div className={s.list}>
      <AnimatePresence initial={false}>
        {groups.map((g) => (
          <motion.section key={g.date} className={`${s.group} ${animate ? '' : s.lazy}`} layout={animate} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <header className={s.day}>
              <span className={s.dayLabel}>{dayLabel(g.date, boot.today)}{isFuture(g.date, boot.today) && <span className={s.soon}>Upcoming</span>}</span>
              {dayTotals && g.spent > 0 && <span className={`secondary tnum ${s.dayTotal}`}>{formatCents(g.spent)}</span>}
            </header>
            {g.items.map((t) => {
              const cat = lookups.cat.get(t.category_id)
              if (!cat) return null
              const row = (
                <TxnRow t={t} cat={cat} today={boot.today} mark={markFor(t.what)} flash={recent.has(t.id)}
                  from={t.from_id ? lookups.acct.get(t.from_id) : undefined}
                  to={t.to_id ? lookups.acct.get(t.to_id) : undefined}
                  selected={selection ? selection.has(t.id) : undefined}
                  onLongPress={onLongPress ? () => onLongPress(t.id) : undefined}
                  onClick={selection ? () => onToggle?.(t.id) : onSelect ? () => onSelect(t) : undefined} />
              )
              return (
                <motion.div key={t.id} layout={animate} className={s.item}
                  initial={{ opacity: 0, transform: 'translateY(6px)' }} animate={{ opacity: 1, transform: 'translateY(0px)' }} exit={{ opacity: 0, transform: 'scale(0.98)' }}
                  transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}>
                  {swipe && !selection ? <SwipeRow onDelete={() => remove(t)} onDuplicate={() => add.open({ duplicate: t })}>{row}</SwipeRow> : row}
                </motion.div>
              )
            })}
          </motion.section>
        ))}
      </AnimatePresence>
    </div>
  )
}

export function TxnListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className={s.list} aria-busy>
      <div className={s.day}><span className={s.skelCaps} /></div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={s.skelRow}><span className={s.skelMark} /><span className={s.skelText}><i /><i /></span><span className={s.skelAmt} /></div>
      ))}
    </div>
  )
}
