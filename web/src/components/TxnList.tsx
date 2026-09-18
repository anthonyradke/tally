import { AnimatePresence, motion } from 'motion/react'
import type { Bootstrap, Txn } from '@/api/client'
import type { Lookups } from '@/lib/data'
import { groupByDay } from '@/lib/txn'
import { dayLabel, isFuture } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { TxnRow } from './TxnRow'
import s from './TxnList.module.css'

interface Props {
  items: Txn[]
  boot: Bootstrap
  lookups: Lookups
  onSelect?: (t: Txn) => void
  /** Show a day total (spending) in each day header. */
  dayTotals?: boolean
}

export function TxnList({ items, boot, lookups, onSelect, dayTotals = true }: Props) {
  const groups = groupByDay(items, (t) => lookups.cat.get(t.category_id)?.type ?? 'Spending')
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
              return (
                <motion.div key={t.id} layout className={s.item}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1], delay: Math.min(i, 14) * 0.025 }}>
                  <TxnRow t={t} cat={cat} today={boot.today}
                    from={t.from_id ? lookups.acct.get(t.from_id) : undefined}
                    to={t.to_id ? lookups.acct.get(t.to_id) : undefined}
                    onClick={onSelect ? () => onSelect(t) : undefined} />
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
