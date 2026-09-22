import { useState } from 'react'
import { motion } from 'motion/react'
import { useNavigate, useSearchParams } from 'react-router'
import { useOpen } from '@/lib/nav'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { api } from '@/api/client'
import { useBootstrap } from '@/lib/data'
import { useToast } from '@/components/Toast'
import { formatCents, parseDollars, pct } from '@/lib/money'
import { fromISO, monthLabel } from '@/lib/dates'
import { monthsNow } from '@/lib/months'
import { categoryVisual } from '@/icons/categories'
import { Hero } from '@/components/Hero'
import { Amount } from '@/components/Amount'
import { Panel, Section } from '@/components/Panel'
import { BudgetMeter } from '@/components/BudgetMeter'
import { budgetFor } from '@/lib/budgets'
import { BudgetSetup } from './BudgetSetup'
import { Ring } from '@/components/Ring'
import { Segmented } from '@/components/Segmented'
import { Delta } from './HomeMonth'
import { Mark } from '@/components/Mark'
import { LineChart } from '@/components/LineChart'
import s from './Insights.module.css'

export function Insights() {
  const boot = useBootstrap()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [table, setTable] = useState(false)
  const b = boot.data
  if (!b) return null
  const months = b.months
  const { cur, upTo } = monthsNow(b)
  const m = months.find((r) => r.month.slice(0, 7) === params.get('m')) ?? cur
  const ym = m.month.slice(0, 7)
  const idx = months.indexOf(m)
  const prev = months[idx - 1]
  const spending = b.categories.filter((c) => c.type === 'Spending')
  const rows = spending.map((c) => ({ c, amt: m.by_category[String(c.id)] ?? 0, budget: c.active ? budgetFor(b, c, m.month) : null }))
    .filter((r) => r.amt || r.budget).sort((x, y) => y.amt - x.amt)
  const budgeted = rows.filter((r) => r.budget)
  const budgetTotal = budgeted.reduce((n, r) => n + (r.budget ?? 0), 0)
  const budgetSpent = budgeted.reduce((n, r) => n + r.amt, 0)

  const flow = [
    { key: 'spent', label: 'Spent', cents: m.spent, color: 'var(--fg)' },
    { key: 'saved', label: 'Saved', cents: m.saving, color: 'var(--tint-teal)' },
    { key: 'loan', label: 'Loan payments', cents: m.loan, color: 'var(--tint-amber)' },
    { key: 'left', label: 'Left over', cents: Math.max(0, m.left_over), color: 'var(--pos)' },
  ]
  const flowTotal = Math.max(m.money_in, flow.reduce((n, f) => n + Math.max(0, f.cents), 0), 1)
  const monthName = fromISO(m.month).toLocaleDateString('en-US', { month: 'long' })
  const spentRows = rows.filter((r) => r.amt > 0)

  return (
    <div className={s.screen}>
      <h1 className={`large-title ${s.title}`}>Insights</h1>
      <Segmented id="month" label="Month" value={ym} onChange={(v) => setParams({ m: v }, { replace: true })}
        options={months.map((r) => ({ value: r.month.slice(0, 7), label: shortMonth(r.month, months) }))} />

      <Hero label={`Left over in ${monthName}`} cents={m.left_over} tone={m.left_over >= 0 ? 'pos' : 'neg'}
        sub={prev && <span className={s.deltaRow}><Delta cents={m.left_over - prev.left_over} /><span>vs {fromISO(prev.month).toLocaleDateString('en-US', { month: 'long' })}</span></span>} />

      <Section title="Where the money went">
        <Panel>
          <div className="label">Money in</div>
          <Amount cents={m.money_in} size="title" tone="pos" roll />
          <div className={s.flow} role="img" aria-label={flow.map((f) => `${f.label} ${formatCents(f.cents)}`).join(', ')}>
            {flow.filter((f) => f.cents > 0).map((f) => <motion.i key={f.key} layout style={{ flexGrow: f.cents / flowTotal, background: f.color }} transition={{ type: 'spring', stiffness: 300, damping: 34 }} />)}
          </div>
          <div className={s.tiles}>
            {flow.map((f) => (
              <div key={f.key} className={s.tile}>
                <span className="label"><i className={s.key} style={{ background: f.color }} />{f.label}</span>
                <Amount cents={f.key === 'left' ? m.left_over : f.cents} size="body" tone={f.key === 'left' ? (m.left_over >= 0 ? 'pos' : 'neg') : 'neutral'} roll />
              </div>
            ))}
          </div>
        </Panel>
      </Section>

      <BudgetSetup trigger={(openBudgets) => <Section title="Spending" action="Set budgets" onAction={openBudgets}>
        <Panel>
          {spentRows.length > 0 ? (
            <div className={s.ringWrap}>
              <Ring key={ym} label={`Spending by category in ${monthName}`} slices={spentRows.map(({ c, amt }) => ({ key: String(c.id), value: amt, color: categoryVisual(c).color }))}>
                <Amount cents={m.spent} size="title" showCents={false} roll />
                <span className="secondary">{spentRows.length} {spentRows.length === 1 ? 'category' : 'categories'}</span>
              </Ring>
              {budgeted.length > 0 && <p className={`secondary tnum ${budgetSpent > budgetTotal ? 'neg' : ''}`}>{formatCents(budgetSpent, { cents: false })} of {formatCents(budgetTotal, { cents: false })} budgeted</p>}
            </div>
          ) : <p className="secondary">{m === cur ? 'Nothing spent this month yet.' : m.month > cur.month ? `Nothing scheduled for ${monthName} yet.` : `Nothing spent in ${monthName}.`}</p>}
          <ul className={s.bars}>
            {rows.map(({ c, amt, budget }) => {
              const v = categoryVisual(c)
              return (
                <li key={c.id}>
                  <button type="button" className={s.bar} onClick={() => nav(`/activity?type=Spending&category=${c.id}&start=${m.month}&end=${endOf(m.month)}`)}>
                    <Mark Icon={v.Icon} color={v.color} size="sm" />
                    <span className={s.barText}>
                      <span className={s.barHead}><span className={s.barName}>{c.name}</span><Amount cents={amt} size="small" /></span>
                      {budget !== null
                        ? <BudgetMeter name={c.name} spent={amt} budget={budget} color={v.color} month={m.month} today={b.today} />
                        : <span className="secondary tnum">{Math.round(pct(amt, m.spent) * 100)}% of spending</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Panel>
      </Section>} />

      <Section title="Net worth">
        <Panel><LineChart points={upTo.map((r) => ({ x: r.month, y: r.net_worth }))} xLabel={(x) => monthLabel(x)} ariaLabel="Net worth by month" /></Panel>
      </Section>

      <MonthEnd ym={ym} />

      <Section title="Every month" action={table ? 'Hide table' : 'Show table'} onAction={() => setTable(!table)}>
        {table && (
          <Panel flush>
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
          </Panel>
        )}
        <p className={`secondary ${s.csv}`}>Download <a className={s.a} href="/export/months.csv">months.csv</a> or <a className={s.a} href="/export/log.csv">log.csv</a></p>
      </Section>
    </div>
  )
}

/** "Sep", or "Sep 2025" when the months span more than one year. */
const shortMonth = (iso: string, all: { month: string }[]) => {
  const multi = all.length > 0 && all[0].month.slice(0, 4) !== all[all.length - 1].month.slice(0, 4)
  return fromISO(iso).toLocaleDateString('en-US', multi ? { month: 'short', year: '2-digit' } : { month: 'short' })
}

const endOf = (month: string) => { const [y, mo] = month.split('-').map(Number); const d = new Date(y, mo, 0); return `${y}-${String(mo).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** The three month-end steps: typed investment balances, HYSA interest, reconcile status. */
function MonthEnd({ ym }: { ym: string }) {
  const boot = useBootstrap()
  const q = useQuery({ queryKey: ['month-end', ym], queryFn: () => api.monthEnd(ym) })
  const qc = useQueryClient()
  const toast = useToast()
  const open = useOpen()
  const [typed, setTyped] = useState<Record<number, string>>({})
  const [interest, setInterest] = useState<Record<number, string>>({})
  const refresh = () => { qc.invalidateQueries({ queryKey: ['month-end', ym] }); qc.invalidateQueries({ queryKey: ['bootstrap'] }); qc.invalidateQueries({ queryKey: ['transactions'] }) }
  const saveTyped = useMutation({
    mutationFn: () => api.monthEndTyped(ym, Object.fromEntries(Object.entries(typed).filter(([, v]) => v !== '').map(([k, v]) => [k, parseDollars(v) ?? 0]))),
    onSuccess: () => { refresh(); setTyped({}); toast.show({ message: 'Balances saved' }) },
    onError: (e) => toast.show({ message: String(e), tone: 'error' }),
  })
  const logInterest = useMutation({
    // Every account still waiting, at its edited amount or else the proposal shown in the field.
    mutationFn: () => api.monthEndInterest(ym, Object.fromEntries(Object.entries(q.data?.interest ?? {}).filter(([, it]) => !it.logged.length)
      .map(([k, it]) => [k, interest[Number(k)] !== undefined ? parseDollars(interest[Number(k)]) ?? 0 : it.proposed]).filter(([, v]) => v))),
    onSuccess: () => { refresh(); setInterest({}); toast.show({ message: 'Interest logged' }) },
    onError: (e) => toast.show({ message: String(e), tone: 'error' }),
  })
  const b = boot.data, me = q.data
  if (!b || !me) return null
  const inv = b.accounts.filter((a) => a.kind === 'investment' && a.active)
  const hysas = b.accounts.filter((a) => String(a.id) in me.interest)
  const cashCards = b.accounts.filter((a) => (a.kind === 'cash' || a.kind === 'card') && a.active)
  return (
    <Section title={`Month end, ${fromISO(ym + '-01').toLocaleDateString('en-US', { month: 'long' })}`}>
      <Panel>
      <Step n={1} done={inv.length > 0 && me.typed_done} title="Investment balances">
        <form className={s.form} onSubmit={(e) => { e.preventDefault(); saveTyped.mutate() }}>
          {inv.map((a) => (
            <label key={a.id} className={s.field}><span className={s.fieldLabel}>{a.name}</span><span className={s.cur}>$</span>
              <input className="tnum" inputMode="decimal" placeholder={me.typed[String(a.id)] != null ? (me.typed[String(a.id)]! / 100).toFixed(2) : '0.00'} value={typed[a.id] ?? ''} onChange={(e) => setTyped({ ...typed, [a.id]: e.target.value })} /></label>
          ))}
          <button type="submit" className={s.primary} disabled={!Object.values(typed).some(Boolean) || saveTyped.isPending}>Save balances</button>
        </form>
      </Step>
      <Step n={2} done={hysas.length > 0 && me.interest_done} title="HYSA interest">
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
      <Step n={3} done={cashCards.length > 0 && me.recon_done} title="Reconcile">
        <div className={s.reconList}>
          {cashCards.map((a) => { const r = me.recon[String(a.id)]; return (
            <button key={a.id} type="button" className={s.reconRow} onClick={() => open(`/accounts/${a.id}`)}>
              <span>{a.name}</span>
              <span className={`secondary tnum ${r ? (r.actual === r.expected ? 'pos' : 'neg') : ''}`}>{r ? (r.actual === r.expected ? 'reconciled' : `gap ${formatCents(r.actual - r.expected, { sign: 'always' })}`) + ` · ${r.date.slice(5)}` : 'not yet'}</span>
            </button>) })}
        </div>
      </Step>
      </Panel>
    </Section>
  )
}

/** One month-end step. Module level on purpose: defined inside MonthEnd it was a new component every render, so
 *  its inputs remounted and lost focus after each keystroke. */
function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return <div className={s.step}><span className={`${s.n} ${done ? s.done : ''}`}>{done ? <Check strokeWidth={2.5} absoluteStrokeWidth /> : n}</span><div className={s.stepBody}><h3 className={s.stepTitle}>{title}</h3>{children}</div></div>
}
