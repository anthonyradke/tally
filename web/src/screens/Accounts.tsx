import { useNavigate } from 'react-router'
import { ChevronRight } from 'lucide-react'
import type { Account, Kind } from '@/api/client'
import { useBootstrap } from '@/lib/data'
import { bankColor, KIND_LABEL } from '@/icons/banks'
import { Hero } from '@/components/Hero'
import { Amount } from '@/components/Amount'
import s from './Accounts.module.css'

const ORDER: Kind[] = ['cash', 'card', 'investment', 'loan']

export function AccountDot({ a, size = 12 }: { a: Account; size?: number }) {
  return <i className={`${s.dot} ${a.kind === 'card' ? s.filled : ''}`} style={{ '--c': bankColor(a), width: size, height: size } as React.CSSProperties} />
}

export function Accounts() {
  const boot = useBootstrap()
  const nav = useNavigate()
  const b = boot.data
  if (!b) return null
  const cur = b.months[b.months.length - 1]
  const prev = b.months[b.months.length - 2]
  const groups = ORDER.map((k) => ({ kind: k, accounts: b.accounts.filter((a) => a.kind === k) })).filter((g) => g.accounts.length)
  const total = (k: Kind) => ({ cash: cur.cash, card: cur.cards, investment: cur.invested, loan: cur.loans })[k]

  return (
    <div className={s.screen}>
      <Hero label="Net worth" cents={cur.net_worth} tone="neutral"
        sub={<>Cash <span className="tnum">{fmt(cur.cash)}</span> + investments <span className="tnum">{fmt(cur.invested)}</span> − cards <span className="tnum">{fmt(cur.cards)}</span>{cur.loans ? <> − loans <span className="tnum">{fmt(cur.loans)}</span></> : null}</>} />

      {groups.map((g) => (
        <section key={g.kind} className={s.group}>
          <header className={s.groupHead}>
            <h2 className="caps">{KIND_LABEL[g.kind]}</h2>
            <Amount cents={total(g.kind)} size="small" className={s.groupTotal} />
          </header>
          <div className={s.list}>
            {g.accounts.map((a) => {
              const bal = cur.balances[String(a.id)] ?? 0
              const delta = prev ? bal - (prev.balances[String(a.id)] ?? 0) : 0
              const owed = a.kind === 'card' || a.kind === 'loan'
              return (
                <button key={a.id} type="button" className={s.row} onClick={() => nav(`/accounts/${a.id}`)}>
                  <AccountDot a={a} />
                  <span className={s.text}>
                    <span className={s.name}>{a.name}</span>
                    <span className="secondary">{a.apy ? `${(a.apy * 100).toFixed(2)}% APY` : a.loan_rate ? `${(a.loan_rate * 100).toFixed(2)}% APR` : a.kind === 'investment' ? 'Typed monthly' : owed ? 'Balance owed' : 'Cash'}</span>
                  </span>
                  <span className={s.right}>
                    <Amount cents={bal} />
                    {prev && delta !== 0 && <span className={`secondary tnum ${(owed ? delta < 0 : delta > 0) ? 'pos' : 'neg'}`}>{delta > 0 ? '+' : '−'}{fmt(Math.abs(delta))}</span>}
                  </span>
                  <ChevronRight className={s.chev} strokeWidth={2} absoluteStrokeWidth />
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

const fmt = (c: number) => (c < 0 ? '−' : '') + '$' + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
