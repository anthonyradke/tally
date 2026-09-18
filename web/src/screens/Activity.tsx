import { useSearchParams } from 'react-router'
import { Search, X } from 'lucide-react'
import type { CatType } from '@/api/client'
import { useBootstrap, useLookups, useTransactions } from '@/lib/data'
import { useAdd } from '@/lib/add'
import { formatCents } from '@/lib/money'
import { categoryVisual } from '@/icons/categories'
import { Chip, ChipRow } from '@/components/Chip'
import { Mark } from '@/components/Mark'
import { TxnList, TxnListSkeleton } from '@/components/TxnList'
import s from './Activity.module.css'

const TYPES: Array<{ label: string; value: CatType | '' }> = [
  { label: 'All', value: '' }, { label: 'Spending', value: 'Spending' }, { label: 'Money in', value: 'Money in' },
  { label: 'Transfers', value: 'Transfer' }, { label: 'Saving', value: 'Saving' }, { label: 'Loans', value: 'Loan' },
]

export function Activity() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const type = (params.get('type') ?? '') as CatType | ''
  const category = Number(params.get('category')) || undefined
  const set = (k: string, v: string | number | undefined) => {
    const p = new URLSearchParams(params)
    if (v === undefined || v === '') p.delete(k); else p.set(k, String(v))
    setParams(p, { replace: true })
  }

  const boot = useBootstrap()
  const lookups = useLookups(boot.data)
  const txns = useTransactions({ q, type, category, limit: 500 })
  const { open } = useAdd()

  const cats = (boot.data?.categories ?? []).filter((c) => !type || c.type === type)

  return (
    <div className={s.screen}>
      <h1 className={s.title}>Activity</h1>
      <label className={s.search}>
        <Search className={s.searchIcon} strokeWidth={2} absoluteStrokeWidth />
        <input type="search" value={q} onChange={(e) => set('q', e.target.value)} placeholder="Search entries, amounts, accounts"
          enterKeyHint="search" autoComplete="off" />
        {q && <button type="button" className={s.clear} onClick={() => set('q', '')} aria-label="Clear search"><X strokeWidth={2.5} absoluteStrokeWidth /></button>}
      </label>

      <ChipRow className={s.chips}>
        {TYPES.map((t) => (
          <Chip key={t.value} selected={type === t.value} onClick={() => { set('type', t.value); set('category', undefined) }}>{t.label}</Chip>
        ))}
      </ChipRow>
      <ChipRow className={s.chips}>
        {cats.map((c) => {
          const v = categoryVisual(c.name, c.type)
          return (
            <Chip key={c.id} size="md" selected={category === c.id} onClick={() => set('category', category === c.id ? undefined : c.id)}
              leading={<Mark Icon={v.Icon} color={v.color} size="sm" />}>{c.name}</Chip>
          )
        })}
      </ChipRow>

      {txns.data && (
        <p className={`secondary ${s.summary}`}>
          {txns.data.total} {txns.data.total === 1 ? 'entry' : 'entries'}
          {(q || type || category) && <> · net <span className="tnum">{formatCents(txns.data.sum)}</span></>}
        </p>
      )}

      {!boot.data || !txns.data ? (
        <TxnListSkeleton />
      ) : txns.data.items.length === 0 ? (
        <div className={s.empty}>
          <p className={s.emptyTitle}>{q ? `Nothing matches “${q}”` : 'Nothing here yet'}</p>
          <p className="secondary">{q ? 'Try a merchant, a category, an account, or an amount like 53.67.' : 'Entries you add will show up here, newest first.'}</p>
        </div>
      ) : (
        <TxnList items={txns.data.items} boot={boot.data} lookups={lookups} onSelect={(t) => open({ edit: t })} />
      )}
    </div>
  )
}
