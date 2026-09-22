import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDownUp, Bookmark, ChevronDown, Search, X } from 'lucide-react'
import { api, ApiError, type CatType, type Category, type Txn } from '@/api/client'
import { useBootstrap, useLookups, useTransactions } from '@/lib/data'
import { useAdd } from '@/lib/add'
import { formatCents } from '@/lib/money'
import { fits } from '@/lib/shapes'
import { monthLabel } from '@/lib/dates'
import { categoryVisual } from '@/icons/categories'
import { bankColor } from '@/icons/banks'
import { Chip, ChipRow } from '@/components/Chip'
import { Mark } from '@/components/Mark'
import { OutboxNotice } from '@/components/Outbox'
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
const PAGE = 200
const errText = (e: unknown) => (e instanceof ApiError ? e.errors.join(' ') : String(e))
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
  const group = params.get('group') ?? ''
  const sortKey = params.get('sort') ?? 'date-desc'
  const [sort, dir] = sortKey.split('-') as ['date' | 'amount', 'asc' | 'desc']
  // One write per change: consecutive calls would each start from the stale `params` and overwrite each other.
  const set = (changes: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) { if (v === undefined || v === '') p.delete(k); else p.set(k, String(v)) }
    setParams(p, { replace: true })
  }
  const filtered = !!(q || type || category || account || tag || start || end || group)

  // Pages of PAGE rows; scrolling near the end asks for the next page. Any filter change starts over.
  const [paging, setPaging] = useState({ key: '', limit: PAGE })
  const pageKey = params.toString()
  const limit = paging.key === pageKey ? paging.limit : PAGE
  const boot = useBootstrap()
  const lookups = useLookups(boot.data)
  const txns = useTransactions({ q, type, category, account, tag, start, end, group, sort, dir, limit })
  const more = !!txns.data && txns.data.items.length < txns.data.total
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el || !more || txns.isFetching) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setPaging({ key: pageKey, limit: limit + PAGE }) }, { rootMargin: '800px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [more, txns.isFetching, pageKey, limit])
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
  // Filters list hidden categories/accounts too (under "Hidden"): their history is still worth finding.
  const catOption = (c: Category): Option => { const v = categoryVisual(c); return { value: String(c.id), label: c.name, group: c.active ? c.type : 'Hidden', mark: <Mark Icon={v.Icon} color={v.color} size="sm" /> } }
  const byActive = <T extends { active: boolean }>(xs: T[]) => [...xs.filter((x) => x.active), ...xs.filter((x) => !x.active)]
  const catOptions: Option[] = byActive((b?.categories ?? []).filter((c) => !type || c.type === type)).map(catOption)
  const acctOptions: Option[] = byActive(b?.accounts ?? []).map((a) => ({ value: String(a.id), label: a.name, group: a.active ? { cash: 'Cash', card: 'Cards', investment: 'Investments', loan: 'Loans' }[a.kind] : 'Hidden', mark: <i className={s.dot} style={{ background: bankColor(a) }} /> }))

  const refresh = () => { qc.invalidateQueries({ queryKey: ['transactions'] }); qc.invalidateQueries({ queryKey: ['bootstrap'] }) }
  const saveView = useMutation({
    mutationFn: () => api.saveView({ name: viewName.trim(), query: params.toString() }),
    onSuccess: () => { setSaving(false); setViewName(''); refresh(); toast.show({ message: 'View saved' }) },
    onError: (e) => toast.show({ message: `Couldn't save the view: ${errText(e)}`, tone: 'error' }),
  })
  const bulk = useMutation({
    mutationFn: (body: Parameters<typeof api.bulk>[0]) => api.bulk(body),
    onSuccess: (res, body) => {
      refresh(); setSelection(null); setTagging(false); setNewTags('')
      const n = body.ids.length
      // The server returns what it deleted, including rows selected under an earlier filter.
      const gone: Txn[] = res.deleted ?? []
      if (body.action === 'delete') toast.show({ message: `Deleted ${n} ${n === 1 ? 'entry' : 'entries'}`, action: { label: 'Undo', onClick: () => api.restore(gone).then(refresh, (e) => toast.show({ message: `Couldn't undo: ${errText(e)}`, tone: 'error' })) } })
      else toast.show({ message: body.action === 'tag' ? `Tagged ${n}` : `Recategorized ${n}` })
    },
    onError: (e) => toast.show({ message: errText(e), tone: 'error' }),
  })

  const toggle = (id: number) => setSelection((sel) => { const next = new Set(sel ?? []); next.has(id) ? next.delete(id) : next.add(id); return next })
  const ids = [...(selection ?? [])]
  // Move-to offers only categories every selected (visible) entry fits; the server checks the rest.
  const picked = (txns.data?.items ?? []).filter((t) => selection?.has(t.id))
  const recatOptions: Option[] = (b?.categories ?? []).filter((c) => c.active && picked.every((t) => fits(t, c.type))).map(catOption)
  const summary = (p: NonNullable<typeof txns.data>) => {
    const types = Object.keys(p.by_type)
    if (types.length <= 1) return <>total <span className="tnum">{formatCents(p.sum)}</span></>
    // Net the way Left over works: money in minus spending, saving and loan payments; transfers move nothing.
    const bt = p.by_type, net = (bt['Money in'] ?? 0) - (bt.Spending ?? 0) - (bt.Saving ?? 0) - (bt.Loan ?? 0)
    return <>net <span className="tnum">{formatCents(net, { sign: 'always' })}</span></>
  }

  return (
    <div className={s.screen}>
      <h1 className={s.title}>Activity</h1>
      <OutboxNotice />
      <label className={s.search}>
        <Search className={s.searchIcon} strokeWidth={2} absoluteStrokeWidth />
        <input type="search" value={q} onChange={(e) => set({ q: e.target.value })} placeholder="Search entries, notes, tags, amounts" enterKeyHint="search" autoComplete="off" />
        {q && <button type="button" className={s.clear} onClick={() => set({ q: undefined })} aria-label="Clear search"><X strokeWidth={2.5} absoluteStrokeWidth /></button>}
      </label>

      <ChipRow className={s.chips}>
        {TYPES.map((t) => <Chip key={t.value} selected={type === t.value} onClick={() => set({ type: t.value, category: undefined })}>{t.label}</Chip>)}
      </ChipRow>
      <ChipRow className={s.chips}>
        <Chip selected={!!cat} onClick={() => setPicker('cat')} leading={cat && <Mark Icon={categoryVisual(cat).Icon} color={categoryVisual(cat).color} size="sm" />} trailing={<ChevronDown strokeWidth={2.5} absoluteStrokeWidth style={{ width: 14, height: 14 }} />}>{cat?.name ?? 'Category'}</Chip>
        <Chip selected={!!acct} onClick={() => setPicker('acct')} leading={acct && <i className={s.dot} style={{ background: bankColor(acct) }} />} trailing={<ChevronDown strokeWidth={2.5} absoluteStrokeWidth style={{ width: 14, height: 14 }} />}>{acct?.name ?? 'Account'}</Chip>
        {tag && <Chip selected onClick={() => set({ tag: undefined })} trailing={<X strokeWidth={2.5} absoluteStrokeWidth style={{ width: 12, height: 12 }} />}>#{tag}</Chip>}
        {group && <Chip selected onClick={() => set({ group: undefined })} trailing={<X strokeWidth={2.5} absoluteStrokeWidth style={{ width: 12, height: 12 }} />}>Split purchase</Chip>}
        {(start || end) && <Chip selected onClick={() => set({ start: undefined, end: undefined })} trailing={<X strokeWidth={2.5} absoluteStrokeWidth style={{ width: 12, height: 12 }} />}>{start ? monthLabel(start) : `until ${end}`}</Chip>}
        <Chip selected={sortKey !== 'date-desc'} onClick={() => setPicker('sort')} leading={<ArrowDownUp strokeWidth={2} absoluteStrokeWidth style={{ width: 14, height: 14 }} />}>{SORTS.find((x) => x.value === sortKey)?.label}</Chip>
        {filtered && <Chip onClick={() => setSaving(true)} leading={<Bookmark strokeWidth={2} absoluteStrokeWidth style={{ width: 14, height: 14 }} />}>Save view</Chip>}
        {b?.saved_views.map((v) => <Chip key={v.id} selected={params.toString() === v.query} onClick={() => setParams(new URLSearchParams(v.query), { replace: true })} leading={<Bookmark strokeWidth={2} absoluteStrokeWidth style={{ width: 14, height: 14 }} />}>{v.name}</Chip>)}
        {!selection && txns.data && txns.data.items.length > 0 && <Chip size="md" onClick={() => setSelection(new Set())}>Select</Chip>}
      </ChipRow>

      {txns.data && (
        <p className={`secondary ${s.summary}`}>
          {txns.data.total} {txns.data.total === 1 ? 'entry' : 'entries'}
          {filtered && <> · {summary(txns.data)}</>}
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
      {more && <div ref={sentinel} className={s.more}>{txns.isFetching ? 'Loading…' : `${txns.data!.total - txns.data!.items.length} more`}</div>}

      {selection && (
        <div className={s.bulkBar} role="toolbar" aria-label="Selection actions">
          <span className={s.bulkCount}>{ids.length} selected</span>
          <button type="button" className={s.bulkBtn} disabled={!ids.length} onClick={() => setPicker('recat')}>Recategorize</button>
          <button type="button" className={s.bulkBtn} disabled={!ids.length} onClick={() => setTagging(true)}>Tag</button>
          <button type="button" className={`${s.bulkBtn} ${s.bulkDanger}`} disabled={!ids.length} onClick={() => bulk.mutate({ ids, action: 'delete' })}>Delete</button>
          <button type="button" className={s.bulkBtn} onClick={() => setSelection(null)}>Done</button>
        </div>
      )}

      <Picker open={picker === 'cat'} onClose={() => setPicker(null)} title="Category" options={catOptions} value={category ? String(category) : ''} searchable noneLabel="All categories" onChange={(v) => set({ category: v || undefined })} />
      <Picker open={picker === 'acct'} onClose={() => setPicker(null)} title="Account" options={acctOptions} value={account ? String(account) : ''} noneLabel="All accounts" onChange={(v) => set({ account: v || undefined })} />
      <Picker open={picker === 'sort'} onClose={() => setPicker(null)} title="Sort" options={SORTS} value={sortKey} onChange={(v) => set({ sort: v === 'date-desc' ? undefined : v })} />
      <Picker open={picker === 'recat'} onClose={() => setPicker(null)} title="Move to category" options={recatOptions} value={null} searchable onChange={(v) => bulk.mutate({ ids, action: 'recategorize', category_id: Number(v) })} />

      <Sheet open={saving} onClose={() => setSaving(false)} title="Save view" action={<button type="button" className={s.sheetSave} disabled={!viewName.trim() || saveView.isPending} onClick={() => saveView.mutate()}>Save</button>}>
        <div className={s.sheetBody}><FieldGroup><TextRow label="Name" value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Amex this month" autoFocus /></FieldGroup><p className="secondary">Saves the current search, filters and sort as a chip here and in Settings.</p></div>
      </Sheet>
      <Sheet open={tagging} onClose={() => setTagging(false)} title={`Tag ${ids.length}`} action={<button type="button" className={s.sheetSave} disabled={!newTags.trim() || bulk.isPending} onClick={() => bulk.mutate({ ids, action: 'tag', tags: newTags.split(/[\s,]+/).filter(Boolean) })}>Apply</button>}>
        <div className={s.sheetBody}><FieldGroup><TextRow label="Tags" value={newTags} onChange={(e) => setNewTags(e.target.value)} placeholder="camping lex" autoCapitalize="none" autoFocus /></FieldGroup><p className="secondary">Added to each selected entry; existing tags stay.</p></div>
      </Sheet>
    </div>
  )
}
