import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { api, type Diagnosis } from '@/api/client'
import { useBootstrap, useLookups, useTransactions } from '@/lib/data'
import { useAdd } from '@/lib/add'
import { useBack } from '@/lib/nav'
import { useToast } from '@/components/Toast'
import { formatCents, parseDollars } from '@/lib/money'
import { monthLabel } from '@/lib/dates'
import { bankColor } from '@/icons/banks'
import { Hero } from '@/components/Hero'
import { Amount } from '@/components/Amount'
import { LineChart } from '@/components/LineChart'
import { TxnList } from '@/components/TxnList'
import s from './AccountDetail.module.css'

export function AccountDetail() {
  const { id } = useParams()
  const aid = Number(id)
  const back = useBack('/accounts')
  const nav = useNavigate()
  const boot = useBootstrap()
  const lk = useLookups(boot.data)
  const txns = useTransactions({ account: aid, limit: 40 }, !!aid)
  const { open } = useAdd()
  const toast = useToast()
  const qc = useQueryClient()
  const [actual, setActual] = useState('')
  const [diag, setDiag] = useState<Diagnosis | null>(null)
  const [typed, setTyped] = useState('')

  const b = boot.data
  const a = b?.accounts.find((x) => x.id === aid)
  if (!b || !a) return null
  const cur = b.months[b.months.length - 1]
  const prev = b.months[b.months.length - 2]
  const bal = cur.balances[String(aid)] ?? 0
  const delta = prev ? bal - (prev.balances[String(aid)] ?? 0) : 0
  const owed = a.kind === 'card' || a.kind === 'loan'
  const series = b.months.map((m) => ({ x: m.month, y: m.balances[String(aid)] ?? 0 }))
  const ym = cur.month.slice(0, 7)

  const check = useMutation({
    mutationFn: (save: boolean) => api.reconcile(aid, parseDollars(actual) ?? 0, save),
    onSuccess: (d, save) => {
      setDiag(d)
      if (save) { toast.show({ message: d.gap === 0 ? `${a.name} reconciled` : `Saved with a ${formatCents(d.gap)} gap` }); qc.invalidateQueries({ queryKey: ['month-end'] }) }
    },
    onError: (e) => toast.show({ message: String(e), tone: 'error' }),
  })
  const saveTyped = useMutation({
    mutationFn: () => api.monthEndTyped(ym, { [aid]: parseDollars(typed) ?? 0 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bootstrap'] }); toast.show({ message: `${a.name} balance updated for ${monthLabel(cur.month)}` }); setTyped('') },
  })

  return (
    <div className={s.screen}>
      <button type="button" className={s.back} onClick={back}><ChevronLeft strokeWidth={2} absoluteStrokeWidth />Accounts</button>
      <Hero label={a.name} cents={bal}
        trailing={prev && delta !== 0 ? <span className={`${s.delta} ${(owed ? delta < 0 : delta > 0) ? 'pos' : 'neg'}`}>{delta > 0 ? '+' : '−'}{formatCents(Math.abs(delta), { cents: false })} <span className={s.deltaLabel}>vs {monthLabel(prev.month)}</span></span> : undefined}
        sub={<><i className={s.dot} style={{ background: bankColor(a) }} />{{ cash: 'Cash account', card: 'Credit card · balance owed', investment: 'Investment · typed monthly', loan: 'Loan · accrues monthly' }[a.kind]}{a.apy ? ` · ${(a.apy * 100).toFixed(2)}% APY` : ''}{a.loan_rate ? ` · ${(a.loan_rate * 100).toFixed(2)}% APR` : ''}</>} />

      <section className={s.section}>
        <h2 className="caps">Balance by month</h2>
        <LineChart points={series} color={bankColor(a)} xLabel={(x) => monthLabel(x)} ariaLabel={`${a.name} balance by month`} />
      </section>

      {(a.kind === 'cash' || a.kind === 'card') && (
        <section className={s.section}>
          <h2 className="caps">Reconcile</h2>
          <p className="secondary">Type what the bank app shows right now. Rows dated after today are ignored.</p>
          <form className={s.reconForm} onSubmit={(e) => { e.preventDefault(); check.mutate(false) }}>
            <span className={s.cur}>$</span>
            <input className={`tnum ${s.actual}`} inputMode="decimal" placeholder="0.00" value={actual} onChange={(e) => setActual(e.target.value)} aria-label="Balance in the bank app" />
            <button type="submit" className={s.ghost} disabled={!actual || check.isPending}>Check</button>
            <button type="button" className={s.primary} disabled={!actual || check.isPending} onClick={() => check.mutate(true)}>Save</button>
          </form>
          {diag && (
            <div className={s.diag}>
              <div className={s.diagRow}><span className="secondary">App shows</span><Amount cents={diag.expected} /></div>
              <div className={s.diagRow}><span className="secondary">Bank shows</span><Amount cents={diag.actual} /></div>
              <div className={s.diagRow}><span className="secondary">Gap</span><Amount cents={diag.gap} tone={diag.gap === 0 ? 'pos' : 'neg'} sign="always" /></div>
              {diag.gap === 0 ? <p className={`${s.note} pos`}>Reconciles.</p> : (
                <>
                  {diag.doubled.length > 0 && <><p className={s.note}><b>Exactly double a row</b> — likely income logged From instead of To.</p><TxnList items={diag.doubled} boot={b} lookups={lk} dayTotals={false} onSelect={(t) => open({ edit: t })} /></>}
                  {diag.single.length > 0 && <><p className={s.note}><b>Exactly one row</b> — missing or duplicated.</p><TxnList items={diag.single} boot={b} lookups={lk} dayTotals={false} onSelect={(t) => open({ edit: t })} /></>}
                  {!diag.doubled.length && !diag.single.length && <p className={`${s.note} secondary`}>No single row explains it. Look for a missing entry.</p>}
                </>
              )}
              {diag.future.length > 0 && <><p className={`${s.note} secondary`}>Pre-logged, not yet posted — excluded above.</p><TxnList items={diag.future} boot={b} lookups={lk} dayTotals={false} onSelect={(t) => open({ edit: t })} /></>}
            </div>
          )}
        </section>
      )}

      {a.kind === 'investment' && (
        <section className={s.section}>
          <h2 className="caps">Balance for {monthLabel(cur.month)}</h2>
          <p className="secondary">Investments aren't computed from entries — type what the account showed at month end.</p>
          <form className={s.reconForm} onSubmit={(e) => { e.preventDefault(); saveTyped.mutate() }}>
            <span className={s.cur}>$</span>
            <input className={`tnum ${s.actual}`} inputMode="decimal" placeholder={(bal / 100).toFixed(2)} value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Typed balance" />
            <button type="submit" className={s.primary} disabled={!typed || saveTyped.isPending}>Save</button>
          </form>
        </section>
      )}

      <section className={s.section}>
        <button type="button" className={s.sectionHead} onClick={() => nav(`/activity?account=${aid}`)}>
          <h2 className="caps">Activity</h2><span className={`secondary ${s.more}`}>All entries <ChevronRight strokeWidth={2} absoluteStrokeWidth /></span>
        </button>
        {txns.data && (txns.data.items.length ? <TxnList items={txns.data.items} boot={b} lookups={lk} onSelect={(t) => open({ edit: t })} swipe /> : <p className="secondary">No entries touch this account yet.</p>)}
      </section>
    </div>
  )
}
