import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { api } from '@/api/client'
import { useBootstrap } from '@/lib/data'
import { useToast } from '@/components/Toast'
import { formatCents, parseDollars, pct } from '@/lib/money'
import { monthLabel } from '@/lib/dates'
import { categoryVisual } from '@/icons/categories'
import { Hero } from '@/components/Hero'
import { Amount } from '@/components/Amount'
import { Chip, ChipRow } from '@/components/Chip'
import { Mark } from '@/components/Mark'
import { LineChart } from '@/components/LineChart'
import s from './Insights.module.css'

export function Insights() {
  const boot = useBootstrap()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const b = boot.data
  if (!b) return null
  const months = b.months
  const m = months.find((r) => r.month.slice(0, 7) === params.get('m')) ?? months[months.length - 1]
  const ym = m.month.slice(0, 7)
  const idx = months.indexOf(m)
  const prev = months[idx - 1]
  const spending = b.categories.filter((c) => c.type === 'Spending')
  const budgetFor = (cid: number) => b.budgets.find((x) => x.category_id === cid && x.month === m.month)?.amount ?? b.categories.find((c) => c.id === cid)?.budget ?? null
  const rows = spending.map((c) => ({ c, amt: m.by_category[String(c.id)] ?? 0, budget: budgetFor(c.id) }))
    .filter((r) => r.amt || r.budget).sort((x, y) => y.amt - x.amt)
  const budgeted = rows.filter((r) => r.budget)
  const budgetTotal = budgeted.reduce((n, r) => n + (r.budget ?? 0), 0)
  const budgetSpent = budgeted.reduce((n, r) => n + r.amt, 0)

  return (
    <div className={s.screen}>
      <h1 className={s.title}>Insights</h1>
      <ChipRow>
        {[...months].reverse().map((r) => <Chip key={r.month} selected={r.month === m.month} onClick={() => setParams({ m: r.month.slice(0, 7) }, { replace: true })}>{monthLabel(r.month)}</Chip>)}
      </ChipRow>

      <Hero label={`Left over · ${monthLabel(m.month)}`} cents={m.left_over} tone={m.left_over >= 0 ? 'pos' : 'neg'}
        trailing={prev ? <span className={`secondary tnum ${s.trail}`}>{formatCents(prev.left_over, { cents: false })} <span className={s.trailLabel}>in {monthLabel(prev.month)}</span></span> : undefined}
        sub={<>Money in <span className="tnum">{formatCents(m.money_in)}</span> − spent <span className="tnum">{formatCents(m.spent)}</span>{m.saving ? <> − saved <span className="tnum">{formatCents(m.saving)}</span></> : null}{m.loan ? <> − loans <span className="tnum">{formatCents(m.loan)}</span></> : null}</>} />

      <section className={s.stats}>
        {[['Money in', m.money_in, 'pos'], ['Spent', m.spent, 'neutral'], ['Saved', m.saving, 'neutral'], ['Loan payments', m.loan, 'neutral']].map(([l, v, t]) => (
          <div key={l as string} className={s.stat}><span className="caps">{l}</span><Amount cents={v as number} size="title" tone={t as 'pos' | 'neutral'} roll /></div>
        ))}
      </section>

      <section className={s.section}>
        <header className={s.head}>
          <h2 className="caps">Spending · {monthLabel(m.month)}</h2>
          {budgeted.length > 0 && <span className={`secondary tnum ${budgetSpent > budgetTotal ? 'neg' : ''}`}>{formatCents(budgetSpent, { cents: false })} of {formatCents(budgetTotal, { cents: false })} budgeted</span>}
        </header>
        <ul className={s.bars}>
          {rows.map(({ c, amt, budget }) => {
            const v = categoryVisual(c)
            const share = budget ? pct(amt, budget) : pct(amt, m.spent)
            const over = budget !== null && amt > budget
            return (
              <li key={c.id}>
                <button type="button" className={s.bar} onClick={() => nav(`/activity?type=Spending&category=${c.id}&start=${m.month}&end=${endOf(m.month)}`)}>
                  <Mark Icon={v.Icon} color={v.color} size="sm" />
                  <span className={s.barText}>
                    <span className={s.barHead}><span className={s.barName}>{c.name}</span>{budget !== null && <span className={`secondary tnum ${over ? 'neg' : ''}`}>{over ? 'over by ' + formatCents(amt - budget, { cents: false }) : formatCents(budget - amt, { cents: false }) + ' left'}</span>}</span>
                    <span className={`${s.track} ${budget !== null ? s.budgetTrack : ''}`} style={{ '--c': v.color } as React.CSSProperties}><i style={{ transform: `scaleX(${share})`, background: over ? 'var(--neg)' : v.color }} /></span>
                  </span>
                  <span className={s.barAmt}><Amount cents={amt} size="small" />{budget !== null && <span className={`secondary tnum ${s.of}`}>of {formatCents(budget, { cents: false })}</span>}</span>
                </button>
              </li>
            )
          })}
          {rows.length === 0 && <p className="secondary">Nothing spent this month yet.</p>}
        </ul>
        <button type="button" className={s.link} onClick={() => nav('/settings/categories')}>Set budgets in Settings</button>
      </section>

      <section className={s.section}>
        <h2 className="caps">Net worth</h2>
        <LineChart points={months.map((r) => ({ x: r.month, y: r.net_worth }))} xLabel={(x) => monthLabel(x)} ariaLabel="Net worth by month" />
      </section>

      <MonthEnd ym={ym} />

      <section className={s.section}>
        <h2 className="caps">Every month</h2>
        <div className={s.tableWrap}>
          <table className={`tnum ${s.table}`}>
            <thead><tr><th>Month</th><th>Money in</th>{spending.map((c) => <th key={c.id}>{c.name}</th>)}<th>Spent</th><th>Loans</th><th>Saved</th><th>Left over</th>{b.accounts.map((a) => <th key={a.id}>{a.name}</th>)}<th>Net worth</th></tr></thead>
            <tbody>{[...months].reverse().map((r) => (
              <tr key={r.month} className={r.month === m.month ? s.on : ''}>
                <th scope="row">{monthLabel(r.month)}</th><td className="pos">{formatCents(r.money_in)}</td>
                {spending.map((c) => <td key={c.id} className={r.by_category[String(c.id)] ? '' : s.dim}>{formatCents(r.by_category[String(c.id)] ?? 0)}</td>)}
                <td><b>{formatCents(r.spent)}</b></td><td>{formatCents(r.loan)}</td><td>{formatCents(r.saving)}</td><td className={r.left_over >= 0 ? 'pos' : 'neg'}><b>{formatCents(r.left_over)}</b></td>
                {b.accounts.map((a) => <td key={a.id}>{formatCents(r.balances[String(a.id)] ?? 0)}</td>)}<td><b>{formatCents(r.net_worth)}</b></td>
              </tr>))}</tbody>
          </table>
        </div>
        <p className="secondary">Download <a className={s.a} href="/export/months.csv">months.csv</a> · <a className={s.a} href="/export/log.csv">log.csv</a></p>
      </section>
    </div>
  )
}

const endOf = (month: string) => { const [y, mo] = month.split('-').map(Number); const d = new Date(y, mo, 0); return `${y}-${String(mo).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** The three month-end steps: typed investment balances, HYSA interest, reconcile status. */
function MonthEnd({ ym }: { ym: string }) {
  const boot = useBootstrap()
  const q = useQuery({ queryKey: ['month-end', ym], queryFn: () => api.monthEnd(ym) })
  const qc = useQueryClient()
  const toast = useToast()
  const nav = useNavigate()
  const [typed, setTyped] = useState<Record<number, string>>({})
  const [interest, setInterest] = useState<Record<number, string>>({})
  const refresh = () => { qc.invalidateQueries({ queryKey: ['month-end', ym] }); qc.invalidateQueries({ queryKey: ['bootstrap'] }); qc.invalidateQueries({ queryKey: ['transactions'] }) }
  const saveTyped = useMutation({
    mutationFn: () => api.monthEndTyped(ym, Object.fromEntries(Object.entries(typed).filter(([, v]) => v !== '').map(([k, v]) => [k, parseDollars(v) ?? 0]))),
    onSuccess: () => { refresh(); setTyped({}); toast.show({ message: 'Balances saved' }) },
  })
  const logInterest = useMutation({
    mutationFn: () => api.monthEndInterest(ym, Object.fromEntries(Object.entries(interest).filter(([, v]) => v !== '').map(([k, v]) => [k, parseDollars(v) ?? 0]))),
    onSuccess: () => { refresh(); setInterest({}); toast.show({ message: 'Interest logged' }) },
  })
  const b = boot.data, me = q.data
  if (!b || !me) return null
  const inv = b.accounts.filter((a) => a.kind === 'investment')
  const hysas = b.accounts.filter((a) => String(a.id) in me.interest)
  const cashCards = b.accounts.filter((a) => a.kind === 'cash' || a.kind === 'card')
  const Step = ({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) => (
    <div className={s.step}><span className={`${s.n} ${done ? s.done : ''}`}>{done ? <Check strokeWidth={2.5} absoluteStrokeWidth /> : n}</span><div className={s.stepBody}><h3 className={s.stepTitle}>{title}</h3>{children}</div></div>
  )
  return (
    <section className={s.section}>
      <h2 className="caps">Month end · {monthLabel(ym + '-01')}</h2>
      <Step n={1} done={me.typed_done} title="Investment balances">
        <form className={s.form} onSubmit={(e) => { e.preventDefault(); saveTyped.mutate() }}>
          {inv.map((a) => (
            <label key={a.id} className={s.field}><span className={s.fieldLabel}>{a.name}</span><span className={s.cur}>$</span>
              <input className="tnum" inputMode="decimal" placeholder={me.typed[String(a.id)] != null ? (me.typed[String(a.id)]! / 100).toFixed(2) : '0.00'} value={typed[a.id] ?? ''} onChange={(e) => setTyped({ ...typed, [a.id]: e.target.value })} /></label>
          ))}
          <button type="submit" className={s.primary} disabled={!Object.values(typed).some(Boolean) || saveTyped.isPending}>Save balances</button>
        </form>
      </Step>
      <Step n={2} done={me.interest_done} title="HYSA interest">
        {hysas.length === 0 ? <p className="secondary">No account has an APY set. Add one in Settings and a proposal appears here.</p> : (
          <form className={s.form} onSubmit={(e) => { e.preventDefault(); logInterest.mutate() }}>
            {hysas.map((a) => { const it = me.interest[String(a.id)]; return (
              <label key={a.id} className={s.field}><span className={s.fieldLabel}>{a.name}</span>
                {it.logged.length ? <span className="pos tnum">{formatCents(it.logged[0].amount)} logged</span> : <><span className={s.cur}>$</span><input className="tnum" inputMode="decimal" value={interest[a.id] ?? (it.proposed / 100).toFixed(2)} onChange={(e) => setInterest({ ...interest, [a.id]: e.target.value })} /></>}
              </label>) })}
            {!me.interest_done && <button type="submit" className={s.primary} disabled={logInterest.isPending}>Log interest</button>}
          </form>
        )}
      </Step>
      <Step n={3} done={me.recon_done} title="Reconcile">
        <div className={s.reconList}>
          {cashCards.map((a) => { const r = me.recon[String(a.id)]; return (
            <button key={a.id} type="button" className={s.reconRow} onClick={() => nav(`/accounts/${a.id}`)}>
              <span>{a.name}</span>
              <span className={`secondary tnum ${r ? (r.actual === r.expected ? 'pos' : 'neg') : ''}`}>{r ? (r.actual === r.expected ? 'reconciled' : `gap ${formatCents(r.actual - r.expected, { sign: 'always' })}`) + ` · ${r.date.slice(5)}` : 'not yet'}</span>
            </button>) })}
        </div>
      </Step>
    </section>
  )
}
