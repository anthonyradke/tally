import { AnimatePresence, motion } from 'motion/react'
import { useQueryClient } from '@tanstack/react-query'
import { api, type Bootstrap, type Txn } from '@/api/client'
import type { Lookups } from '@/lib/data'
import { useAdd } from '@/lib/add'
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

export function TxnList({ items, boot, lookups, onSelect, dayTotals = true, swipe, selection, onToggle, onLongPress }: Props) {
  const groups = groupByDay(items, (t) => lookups.cat.get(t.category_id)?.type ?? 'Spending')
  const add = useAdd()
  const toast = useToast()
  const qc = useQueryClient()
  const refresh = () => { qc.invalidateQueries({ queryKey: ['transactions'] }); qc.invalidateQueries({ queryKey: ['bootstrap'] }) }
  const remove = (t: Txn) => api.deleteTxn(t.id).then(() => {
    refresh()
    toast.show({ message: `Deleted ${formatCents(Math.abs(t.amount))} · ${t.what || lookups.cat.get(t.category_id)?.name}`, action: { label: 'Undo', onClick: () => api.createTxn({ ...t }).then(refresh) } })
  })
  let idx = 0
  return (
    <div className={s.list}>
      <AnimatePresence initial={true}>
        {groups.map((g) => (
          <motion.section key={g.date} className={s.group} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <header className={s.day}>
              <span className="caps">{dayLabel(g.date, boot.today)}{isFuture(g.date, boot.today) ? ' · upcoming' : ''}</span>
              {dayTotals && g.spent > 0 && <span className={`secondary tnum ${s.dayTotal}`}>{formatCents(g.spent)}</span>}
            </header>
            {g.items.map((t) => {
              const i = idx++
              const cat = lookups.cat.get(t.category_id)
              if (!cat) return null
              const row = (
                <TxnRow t={t} cat={cat} today={boot.today}
                  from={t.from_id ? lookups.acct.get(t.from_id) : undefined}
                  to={t.to_id ? lookups.acct.get(t.to_id) : undefined}
                  selected={selection ? selection.has(t.id) : undefined}
                  onLongPress={onLongPress ? () => onLongPress(t.id) : undefined}
                  onClick={selection ? () => onToggle?.(t.id) : onSelect ? () => onSelect(t) : undefined} />
              )
              return (
                <motion.div key={t.id} layout className={s.item}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1], delay: Math.min(i, 14) * 0.025 }}>
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
