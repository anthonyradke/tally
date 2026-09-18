import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDownUp, Bookmark, ChevronDown, Search, X } from 'lucide-react'
import { api, type CatType, type Txn } from '@/api/client'
import { useBootstrap, useLookups, useTransactions } from '@/lib/data'
import { useAdd } from '@/lib/add'
import { formatCents } from '@/lib/money'
import { monthLabel } from '@/lib/dates'
import { categoryVisual } from '@/icons/categories'
import { bankColor } from '@/icons/banks'
import { Chip, ChipRow } from '@/components/Chip'
import { Mark } from '@/components/Mark'
import { Picker, type Option } from '@/components/Picker'
import { Sheet } from '@/components/Sheet'
import { FieldGroup, TextRow } from '@/components/Field'
import { TxnList, TxnListSkeleton } from '@/components/TxnList'
import { useToast } from '@/components/Toast'
import s from './Activity.module.css'

const TYPES: Array<{ label: string; value: CatType | '' }> = [
  { label: 'All', value: '' }, { label: 'Spending', value: 'Spending' }, { label: 'Money in', value: 'Money in' },
  { label: 'Transfers', value: 'Transfer' }, { label: 'Saving', value: 'Saving' }, { label: 'Loans', value: 'Loan' },
]
const SORTS = [
  { value: 'date-desc', label: 'Newest first' }, { value: 'date-asc', label: 'Oldest first' },
  { value: 'amount-desc', label: 'Largest first' }, { value: 'amount-asc', label: 'Smallest first' },
]

export function Activity() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const type = (params.get('type') ?? '') as CatType | ''
  const category = Number(params.get('category')) || undefined
  const account = Number(params.get('account')) || undefined
  const tag = params.get('tag') ?? ''
  const start = params.get('start') ?? '', end = params.get('end') ?? ''
  const sortKey = params.get('sort') ?? 'date-desc'
  const [sort, dir] = sortKey.split('-') as ['date' | 'amount', 'asc' | 'desc']
  const set = (k: string, v: string | number | undefined) => {
    const p = new URLSearchParams(params)
    if (v === undefined || v === '') p.delete(k); else p.set(k, String(v))
    setParams(p, { replace: true })
  }
  const filtered = !!(q || type || category || account || tag || start || end)

  const boot = useBootstrap()
  const lookups = useLookups(boot.data)
  const txns = useTransactions({ q, type, category, account, tag, start, end, sort, dir, limit: 500 })
  const { open } = useAdd()
  const toast = useToast()
  const qc = useQueryClient()
  const [picker, setPicker] = useState<null | 'cat' | 'acct' | 'sort' | 'recat'>(null)
  const [saving, setSaving] = useState(false)
  const [viewName, setViewName] = useState('')
  const [selection, setSelection] = useState<Set<number> | null>(null)
  const [tagging, setTagging] = useState(false)
  const [newTags, setNewTags] = useState('')

  const b = boot.data
  const cat = category ? lookups.cat.get(category) : undefined
  const acct = account ? lookups.acct.get(account) : undefined
  const catOptions: Option[] = (b?.categories ?? []).filter((c) => !type || c.type === type).map((c) => { const v = categoryVisual(c); return { value: String(c.id), label: c.name, group: c.type, mark: <Mark Icon={v.Icon} color={v.color} size="sm" /> } })
  const acctOptions: Option[] = (b?.accounts ?? []).map((a) => ({ value: String(a.id), label: a.name, group: { cash: 'Cash', card: 'Cards', investment: 'Investments', loan: 'Loans' }[a.kind], mark: <i className={s.dot} style={{ background: bankColor(a) }} /> }))

  const refresh = () => { qc.invalidateQueries({ queryKey: ['transactions'] }); qc.invalidateQueries({ queryKey: ['bootstrap'] }) }
  const saveView = useMutation({
    mutationFn: () => api.saveView({ name: viewName.trim(), query: params.toString() }),
    onSuccess: () => { setSaving(false); setViewName(''); refresh(); toast.show({ message: 'View saved' }) },
  })
  const bulk = useMutation({
    mutationFn: async (body: Parameters<typeof api.bulk>[0]) => {
      const before = body.action === 'delete' ? (txns.data?.items ?? []).filter((t) => body.ids.includes(t.id)) : []
      await api.bulk(body); return before
    },
    onSuccess: (before, body) => {
      refresh(); setSelection(null); setTagging(false); setNewTags('')
      const n = body.ids.length
      if (body.action === 'delete') toast.show({ message: `Deleted ${n} ${n === 1 ? 'entry' : 'entries'}`, action: { label: 'Undo', onClick: () => Promise.all(before.map((t: Txn) => api.createTxn({ ...t }))).then(refresh) } })
      else toast.show({ message: body.action === 'tag' ? `Tagged ${n}` : `Recategorized ${n}` })
    },
    onError: (e) => toast.show({ message: String(e), tone: 'error' }),
  })

  const toggle = (id: number) => setSelection((sel) => { const next = new Set(sel ?? []); next.has(id) ? next.delete(id) : next.add(id); return next })
  const ids = [...(selection ?? [])]

  return (
    <div className={s.screen}>
      <h1 className={s.title}>Activity</h1>
      <label className={s.search}>
        <Search className={s.searchIcon} strokeWidth={2} absoluteStrokeWidth />
        <input type="search" value={q} onChange={(e) => set('q', e.target.value)} placeholder="Search entries, notes, tags, amounts" enterKeyHint="search" autoComplete="off" />
        {q && <button type="button" className={s.clear} onClick={() => set('q', '')} aria-label="Clear search"><X strokeWidth={2.5} absoluteStrokeWidth /></button>}
      </label>

      <ChipRow className={s.chips}>
        {TYPES.map((t) => <Chip key={t.value} selected={type === t.value} onClick={() => { set('type', t.value); set('category', undefined) }}>{t.label}</Chip>)}
      </ChipRow>
      <ChipRow className={s.chips}>
        <Chip selected={!!cat} onClick={() => setPicker('cat')} leading={cat && <Mark Icon={categoryVisual(cat).Icon} color={categoryVisual(cat).color} size="sm" />} trailing={<ChevronDown strokeWidth={2.5} absoluteStrokeWidth style={{ width: 14, height: 14 }} />}>{cat?.name ?? 'Category'}</Chip>
        <Chip selected={!!acct} onClick={() => setPicker('acct')} leading={acct && <i className={s.dot} style={{ background: bankColor(acct) }} />} trailing={<ChevronDown strokeWidth={2.5} absoluteStrokeWidth style={{ width: 14, height: 14 }} />}>{acct?.name ?? 'Account'}</Chip>
        {tag && <Chip selected onClick={() => set('tag', undefined)} trailing={<X strokeWidth={2.5} absoluteStrokeWidth style={{ width: 12, height: 12 }} />}>#{tag}</Chip>}
        {(start || end) && <Chip selected onClick={() => { set('start', undefined); set('end', undefined) }} trailing={<X strokeWidth={2.5} absoluteStrokeWidth style={{ width: 12, height: 12 }} />}>{start ? monthLabel(start) : `until ${end}`}</Chip>}
        <Chip selected={sortKey !== 'date-desc'} onClick={() => setPicker('sort')} leading={<ArrowDownUp strokeWidth={2} absoluteStrokeWidth style={{ width: 14, height: 14 }} />}>{SORTS.find((x) => x.value === sortKey)?.label}</Chip>
        {filtered && <Chip onClick={() => setSaving(true)} leading={<Bookmark strokeWidth={2} absoluteStrokeWidth style={{ width: 14, height: 14 }} />}>Save view</Chip>}
        {b?.saved_views.map((v) => <Chip key={v.id} selected={params.toString() === v.query} onClick={() => setParams(new URLSearchParams(v.query), { replace: true })} leading={<Bookmark strokeWidth={2} absoluteStrokeWidth style={{ width: 14, height: 14 }} />}>{v.name}</Chip>)}
        {!selection && txns.data && txns.data.items.length > 0 && <Chip size="md" onClick={() => setSelection(new Set())}>Select</Chip>}
      </ChipRow>

      {txns.data && (
        <p className={`secondary ${s.summary}`}>
          {txns.data.total} {txns.data.total === 1 ? 'entry' : 'entries'}
          {filtered && <> · net <span className="tnum">{formatCents(txns.data.sum)}</span></>}
          {filtered && <> · <button type="button" className={s.reset} onClick={() => setParams(new URLSearchParams(), { replace: true })}>clear filters</button></>}
        </p>
      )}

      {!b || !txns.data ? (
        <TxnListSkeleton />
      ) : txns.data.items.length === 0 ? (
        <div className={s.empty}>
          <p className={s.emptyTitle}>{filtered ? 'Nothing matches' : 'Nothing here yet'}</p>
          <p className="secondary">{filtered ? 'Try a merchant, a category, an account, a #tag, or an amount like 53.67.' : 'Entries you add will show up here, newest first.'}</p>
        </div>
      ) : (
        <TxnList items={txns.data.items} boot={b} lookups={lookups} onSelect={(t) => open({ edit: t })} swipe
          selection={selection ?? undefined} onToggle={toggle} onLongPress={(id) => setSelection((sel) => new Set([...(sel ?? []), id]))} />
      )}

      {selection && (
        <div className={s.bulkBar} role="toolbar" aria-label="Selection actions">
          <span className={s.bulkCount}>{ids.length} selected</span>
          <button type="button" className={s.bulkBtn} disabled={!ids.length} onClick={() => setPicker('recat')}>Recategorize</button>
          <button type="button" className={s.bulkBtn} disabled={!ids.length} onClick={() => setTagging(true)}>Tag</button>
          <button type="button" className={`${s.bulkBtn} ${s.bulkDanger}`} disabled={!ids.length} onClick={() => bulk.mutate({ ids, action: 'delete' })}>Delete</button>
          <button type="button" className={s.bulkBtn} onClick={() => setSelection(null)}>Done</button>
        </div>
      )}

      <Picker open={picker === 'cat'} onClose={() => setPicker(null)} title="Category" options={catOptions} value={category ? String(category) : ''} searchable noneLabel="All categories" onChange={(v) => set('category', v || undefined)} />
      <Picker open={picker === 'acct'} onClose={() => setPicker(null)} title="Account" options={acctOptions} value={account ? String(account) : ''} noneLabel="All accounts" onChange={(v) => set('account', v || undefined)} />
      <Picker open={picker === 'sort'} onClose={() => setPicker(null)} title="Sort" options={SORTS} value={sortKey} onChange={(v) => set('sort', v === 'date-desc' ? undefined : v)} />
      <Picker open={picker === 'recat'} onClose={() => setPicker(null)} title="Move to category" options={(b?.categories ?? []).map((c) => { const v = categoryVisual(c); return { value: String(c.id), label: c.name, group: c.type, mark: <Mark Icon={v.Icon} color={v.color} size="sm" /> } })} value={null} searchable onChange={(v) => bulk.mutate({ ids, action: 'recategorize', category_id: Number(v) })} />

      <Sheet open={saving} onClose={() => setSaving(false)} title="Save view" action={<button type="button" className={s.sheetSave} disabled={!viewName.trim() || saveView.isPending} onClick={() => saveView.mutate()}>Save</button>}>
        <div className={s.sheetBody}><FieldGroup><TextRow label="Name" value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Amex this month" autoFocus /></FieldGroup><p className="secondary">Saves the current search, filters and sort as a chip here and in Settings.</p></div>
      </Sheet>
      <Sheet open={tagging} onClose={() => setTagging(false)} title={`Tag ${ids.length}`} action={<button type="button" className={s.sheetSave} disabled={!newTags.trim() || bulk.isPending} onClick={() => bulk.mutate({ ids, action: 'tag', tags: newTags.split(/[\s,]+/).filter(Boolean) })}>Apply</button>}>
        <div className={s.sheetBody}><FieldGroup><TextRow label="Tags" value={newTags} onChange={(e) => setNewTags(e.target.value)} placeholder="camping lex" autoCapitalize="none" autoFocus /></FieldGroup><p className="secondary">Added to each selected entry; existing tags stay.</p></div>
      </Sheet>
    </div>
  )
}
