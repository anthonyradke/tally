import { useNavigate } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { useBootstrap, useLookups, useTransactions } from '@/lib/data'
import { useAdd } from '@/lib/add'
import { formatCents, pct } from '@/lib/money'
import { monthLabel } from '@/lib/dates'
import { categoryVisual } from '@/icons/categories'
import { Hero } from '@/components/Hero'
import { Amount } from '@/components/Amount'
import { Chip, ChipRow } from '@/components/Chip'
import { Mark } from '@/components/Mark'
import { TxnList } from '@/components/TxnList'
import s from './Home.module.css'

export function Home() {
  const boot = useBootstrap()
  const lookups = useLookups(boot.data)
  const upcoming = useTransactions({ start: boot.data?.today, limit: 20 }, !!boot.data)
  const { open } = useAdd()
  const nav = useNavigate()
  const b = boot.data
  if (!b) return <div className={s.screen} />

  const cur = b.months[b.months.length - 1]
  const prev = b.months[b.months.length - 2]
  const delta = prev ? cur.net_worth - prev.net_worth : 0
  const spending = b.categories.filter((c) => c.type === 'Spending' && (cur.by_category[String(c.id)] ?? 0) > 0)
    .sort((a, c) => (cur.by_category[String(c.id)] ?? 0) - (cur.by_category[String(a.id)] ?? 0))
  const future = (upcoming.data?.items ?? []).filter((t) => t.date > b.today)

  return (
    <div className={s.screen}>
      <Hero
        label="Net worth"
        cents={cur.net_worth}
        trailing={prev && (
          <span className={`${s.delta} ${delta >= 0 ? 'pos' : 'neg'}`}>
            {formatCents(delta, { sign: 'always', cents: false })} <span className={s.deltaLabel}>this month</span>
          </span>
        )}
      />

      <section className={s.stats}>
        <button type="button" className={s.stat} onClick={() => nav('/insights')}>
          <span className="caps">Left over · {monthLabel(cur.month)}</span>
          <Amount cents={cur.left_over} size="title" tone={cur.left_over >= 0 ? 'pos' : 'neg'} roll />
        </button>
        <button type="button" className={s.stat} onClick={() => nav('/activity?type=Spending')}>
          <span className="caps">Spent · {monthLabel(cur.month)}</span>
          <Amount cents={cur.spent} size="title" roll />
        </button>
      </section>

      {b.favorites.length > 0 && (
        <section className={s.section}>
          <h2 className="caps">Quick add</h2>
          <ChipRow className={s.quick}>
            {b.favorites.map((f) => {
              const c = lookups.cat.get(f.category_id)
              const v = c ? categoryVisual(c.name, c.type) : undefined
              return (
                <Chip key={f.id} onClick={() => open({ favorite: f })} leading={v && <Mark Icon={v.Icon} color={v.color} size="sm" />}>
                  {f.label}{f.amount ? <span className={`tnum ${s.quickAmt}`}> {formatCents(f.amount)}</span> : null}
                </Chip>
              )
            })}
          </ChipRow>
        </section>
      )}

      <Hero compact label="Emergency fund" cents={b.ef.progress} progress={pct(b.ef.progress, b.ef.goal)}
        sub={<>of <span className="tnum">{formatCents(b.ef.goal, { cents: false })}</span> · {Math.round(pct(b.ef.progress, b.ef.goal) * 100)}%</>} />

      {spending.length > 0 && (
        <section className={s.section}>
          <button type="button" className={s.sectionHead} onClick={() => nav('/insights')}>
            <h2 className="caps">Spending · {monthLabel(cur.month)}</h2><ChevronRight className={s.chev} strokeWidth={2} absoluteStrokeWidth />
          </button>
          <ul className={s.bars}>
            {spending.slice(0, 6).map((c) => {
              const v = categoryVisual(c.name, c.type); const amt = cur.by_category[String(c.id)] ?? 0
              return (
                <li key={c.id}>
                  <button type="button" className={s.bar} onClick={() => nav(`/activity?type=Spending&category=${c.id}`)}>
                    <Mark Icon={v.Icon} color={v.color} size="sm" />
                    <span className={s.barText}><span className={s.barName}>{c.name}</span>
                      <span className={s.track}><i style={{ transform: `scaleX(${pct(amt, cur.spent)})`, background: v.color }} /></span></span>
                    <Amount cents={amt} size="small" />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {future.length > 0 && (
        <section className={s.section}>
          <h2 className="caps">Upcoming</h2>
          <TxnList items={future} boot={b} lookups={lookups} dayTotals={false} onSelect={(t) => open({ edit: t })} />
        </section>
      )}
    </div>
  )
}
