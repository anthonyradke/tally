import type { Account, Category, Txn } from '@/api/client'
import { Amount } from './Amount'
import { Mark } from './Mark'
import { categoryVisual } from '@/icons/categories'
import { merchantMark } from '@/icons/merchants'
import { bankColor } from '@/icons/banks'
import { rowAmount } from '@/lib/txn'
import { isFuture } from '@/lib/dates'
import s from './TxnRow.module.css'

interface Props {
  t: Txn
  cat: Category
  from?: Account
  to?: Account
  today: string
  onClick?: () => void
}

function AcctTag({ a }: { a: Account }) {
  return (
    <span className={s.acct}>
      <i className={`${s.dot} ${a.kind === 'card' ? s.filled : ''}`} style={{ '--c': bankColor(a) } as React.CSSProperties} />
      {a.name}
    </span>
  )
}

export function TxnRow({ t, cat, from, to, today, onClick }: Props) {
  const merchant = merchantMark(t.what)
  const vis = categoryVisual(cat)
  const amt = rowAmount(cat.type, t.amount)
  const future = isFuture(t.date, today)
  return (
    <button type="button" className={`${s.row} ${future ? s.future : ''}`} onClick={onClick}>
      {merchant ? <Mark spec={merchant} /> : <Mark Icon={vis.Icon} color={vis.color} />}
      <span className={s.text}>
        <span className={s.title}>{t.what || cat.name}</span>
        <span className={`secondary ${s.sub}`}>
          <span>{cat.name}</span>
          {from && <><span className={s.sep}>·</span><AcctTag a={from} /></>}
          {to && <><span className={s.sep}>{from ? '→' : '·'}</span><AcctTag a={to} /></>}
        </span>
      </span>
      <span className={`${s.right} ${amt.muted ? s.muted : ''}`}>
        <Amount cents={amt.cents} sign={amt.sign} tone={amt.tone} />
        {future && <span className={`caps ${s.flag}`}>upcoming</span>}
      </span>
    </button>
  )
}
