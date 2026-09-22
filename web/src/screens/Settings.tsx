import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Reorder } from 'motion/react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { api, type AdminAccount, type AdminCategory, type Favorite, type Recurring, type SavedView } from '@/api/client'
import { useBootstrap } from '@/lib/data'
import { useBack, useOpen } from '@/lib/nav'
import { formatCents, parseDollars } from '@/lib/money'
import { dayLabel, monthLabel, toISO } from '@/lib/dates'
import { monthsNow } from '@/lib/months'
import { applyTheme, getTheme, type Theme } from '@/lib/theme'
import { categoryVisual } from '@/icons/categories'
import { bankColor, KIND_LABEL } from '@/icons/banks'
import { FieldGroup, FieldRow, TextRow } from '@/components/Field'
import { Picker } from '@/components/Picker'
import { Mark } from '@/components/Mark'
import { Chip } from '@/components/Chip'
import { DragRow } from '@/components/DragRow'
import { useToast } from '@/components/Toast'
import { BudgetSetup } from './BudgetSetup'
import { AccountSheet, CategorySheet, FavoriteSheet, RecurringSheet, ViewSheet } from './SettingsSheets'
import s from './Settings.module.css'
import { numpad } from '@/components/NumPad'

export const useAdmin = () => useQuery({ queryKey: ['admin'], queryFn: api.admin })

const SECTIONS = [
  ['shortcuts', 'Quick actions', 'The chips on Home and in New entry'],
  ['accounts', 'Accounts', 'Banks, cards, investments, loans'],
  ['categories', 'Categories & budgets', 'Glyphs, tints, monthly targets'],
  ['recurring', 'Recurring', 'Bills that post themselves'],
  ['views', 'Saved views', 'Filters you keep coming back to'],
  ['general', 'General', 'Emergency fund, Roth, interest, log start'],
] as const

export function Settings() {
  const { section } = useParams()
  const back = useBack('/settings')
  const boot = useBootstrap()
  const admin = useAdmin()
  const title = SECTIONS.find(([k]) => k === section)?.[1] ?? 'Settings'
  return (
    <div className={s.screen}>
      {section ? (
        <button type="button" className={s.back} onClick={back}><ChevronLeft strokeWidth={2} absoluteStrokeWidth />Settings</button>
      ) : null}
      <h1 className={s.title}>{title}</h1>
      {!section && <Index />}
      {section === 'shortcuts' && admin.data && boot.data && <Shortcuts favorites={admin.data.favorites} />}
      {section === 'accounts' && admin.data && <AccountsSection accounts={admin.data.accounts} />}
      {section === 'categories' && admin.data && <CategoriesSection categories={admin.data.categories} />}
      {section === 'recurring' && admin.data && <RecurringSection items={admin.data.recurring} />}
      {section === 'views' && admin.data && <ViewsSection views={admin.data.saved_views} />}
      {section === 'general' && admin.data && <General settings={admin.data.settings} categories={admin.data.categories} />}
    </div>
  )
}

function Index() {
  const open = useOpen()
  const [theme, setTheme] = useState<Theme>(getTheme)
  useEffect(() => applyTheme(theme), [theme])
  return (
    <>
      <FieldGroup>
        {SECTIONS.map(([k, label, hint]) => <FieldRow key={k} label={label} value={<span className="secondary">{hint}</span>} onClick={() => open(`/settings/${k}`)} />)}
      </FieldGroup>
      <FieldGroup title="Appearance">
        <div className={s.segRow}>
          {(['system', 'light', 'dark'] as Theme[]).map((t) => <Chip key={t} selected={theme === t} onClick={() => setTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</Chip>)}
        </div>
      </FieldGroup>
      <FieldGroup title="Data">
        <FieldRow label="Export" value={<span className={s.links}><a href="/export/log.csv">log.csv</a><a href="/export/months.csv">months.csv</a></span>} />
        <BackupRow />
      </FieldGroup>
      <p className={`secondary ${s.version}`}>Tally {__APP_VERSION__}</p>
    </>
  )
}

function Shortcuts({ favorites }: { favorites: Favorite[] }) {
  const boot = useBootstrap()
  const qc = useQueryClient()
  const [order, setOrder] = useState(favorites.map((f) => f.id))
  const [edit, setEdit] = useState<Favorite | null | 'new'>(null)
  useEffect(() => setOrder(favorites.map((f) => f.id)), [favorites])
  const byId = new Map(favorites.map((f) => [f.id, f]))
  const save = useMutation({ mutationFn: (ids: number[]) => api.orderFavorites(ids), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin'] }); qc.invalidateQueries({ queryKey: ['bootstrap'] }) } })
  return (
    <>
      <p className="secondary">One tap pre-fills a new entry. Drag to reorder; they show in this order on Home and in New entry.</p>
      <Reorder.Group axis="y" values={order} onReorder={setOrder} className={s.reorder} as="div">
        {order.map((id) => { const f = byId.get(id); if (!f) return null; const c = boot.data?.categories.find((x) => x.id === f.category_id); const v = c && categoryVisual({ ...c, icon: f.icon ?? c.icon, color: f.color ?? c.color })
          return (
            <DragRow key={id} value={id} className={s.dragRow} onDragEnd={() => save.mutate(order)}>
              <button type="button" className={s.rowBtn} onClick={() => setEdit(f)}>
                {v && <Mark Icon={v.Icon} color={v.color} size="sm" />}
                <span className={s.rowText}><span>{f.label}</span>{f.amount ? <span className="secondary tnum">{formatCents(f.amount)}</span> : null}</span>
                <ChevronRight className={s.chev} strokeWidth={2} absoluteStrokeWidth />
              </button>
            </DragRow>) })}
      </Reorder.Group>
      <button type="button" className={s.add} onClick={() => setEdit('new')}><Plus strokeWidth={2.25} absoluteStrokeWidth />Add quick action</button>
      <FavoriteSheet open={edit !== null} item={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />
    </>
  )
}

function AccountsSection({ accounts }: { accounts: AdminAccount[] }) {
  const boot = useBootstrap()
  const [edit, setEdit] = useState<AdminAccount | null | 'new'>(null)
  const cur = boot.data && monthsNow(boot.data).cur
  return (
    <>
      <FieldGroup>
        {accounts.map((a) => (
          <FieldRow key={a.id} label={a.name} mark={<i className={s.dot} style={{ background: bankColor(a) }} />}
            value={<span className={`secondary ${a.active ? '' : s.dim}`}>{a.active ? KIND_LABEL[a.kind] : 'Hidden'}{cur && a.active ? ` · ${formatCents(cur.balances[String(a.id)] ?? 0)}` : ''}</span>} onClick={() => setEdit(a)} />
        ))}
      </FieldGroup>
      <button type="button" className={s.add} onClick={() => setEdit('new')}><Plus strokeWidth={2.25} absoluteStrokeWidth />Add account</button>
      <AccountSheet open={edit !== null} item={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />
    </>
  )
}

function CategoriesSection({ categories }: { categories: AdminCategory[] }) {
  const qc = useQueryClient()
  const [order, setOrder] = useState(categories.map((c) => c.id))
  const [edit, setEdit] = useState<AdminCategory | null | 'new'>(null)
  useEffect(() => setOrder(categories.map((c) => c.id)), [categories])
  const byId = new Map(categories.map((c) => [c.id, c]))
  const save = useMutation({ mutationFn: (ids: number[]) => api.orderCategories(ids), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin'] }); qc.invalidateQueries({ queryKey: ['bootstrap'] }) } })
  return (
    <>
      <Reorder.Group axis="y" values={order} onReorder={setOrder} className={s.reorder} as="div">
        {order.map((id) => { const c = byId.get(id); if (!c) return null; const v = categoryVisual(c)
          return (
            <DragRow key={id} value={id} className={s.dragRow} onDragEnd={() => save.mutate(order)}>
              <button type="button" className={s.rowBtn} onClick={() => setEdit(c)}>
                <Mark Icon={v.Icon} color={v.color} size="sm" />
                <span className={s.rowText}><span className={c.active ? '' : s.dim}>{c.name}</span><span className="secondary">{c.type}{c.budget ? ` · ${formatCents(c.budget, { cents: false })}/mo` : ''}{c.active ? '' : ' · hidden'}</span></span>
                <ChevronRight className={s.chev} strokeWidth={2} absoluteStrokeWidth />
              </button>
            </DragRow>) })}
      </Reorder.Group>
      <div className={s.actions}>
        <button type="button" className={s.add} onClick={() => setEdit('new')}><Plus strokeWidth={2.25} absoluteStrokeWidth />Add category</button>
        <BudgetSetup trigger={(open) => <button type="button" className={s.add} onClick={open}>Suggest budgets</button>} />
      </div>
      <CategorySheet open={edit !== null} item={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />
    </>
  )
}

function RecurringSection({ items }: { items: Recurring[] }) {
  const boot = useBootstrap()
  const [edit, setEdit] = useState<Recurring | null | 'new'>(null)
  return (
    <>
      <p className="secondary">Each template posts future-dated entries about 45 days ahead, so bills show up as “upcoming” and land on time. Edit or delete a generated entry like any other.</p>
      <FieldGroup>
        {items.map((r) => { const c = boot.data?.categories.find((x) => x.id === r.category_id); const v = c && categoryVisual(c)
          return <FieldRow key={r.id} label={r.label} mark={v && <Mark Icon={v.Icon} color={v.color} size="sm" />} value={<span className={`secondary tnum ${r.active ? '' : s.dim}`}>{formatCents(r.amount)} · {r.freq}{r.active ? ` · next ${r.next_date.slice(5)}` : ' · paused'}</span>} onClick={() => setEdit(r)} /> })}
        {items.length === 0 && <FieldRow label="No templates yet" value={<span className="secondary">Phone, insurance, subscriptions…</span>} />}
      </FieldGroup>
      <button type="button" className={s.add} onClick={() => setEdit('new')}><Plus strokeWidth={2.25} absoluteStrokeWidth />Add recurring</button>
      <RecurringSheet open={edit !== null} item={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />
    </>
  )
}

function ViewsSection({ views }: { views: SavedView[] }) {
  const [edit, setEdit] = useState<SavedView | null>(null)
  return (
    <>
      <p className="secondary">Save a view from Activity with the bookmark button; it appears as a chip there and here.</p>
      <FieldGroup>
        {views.map((v) => <FieldRow key={v.id} label={v.name} value={<Link className="secondary" to={`/activity?${v.query}`} onClick={(e) => e.stopPropagation()}>open</Link>} onClick={() => setEdit(v)} />)}
        {views.length === 0 && <FieldRow label="No saved views yet" />}
      </FieldGroup>
      <ViewSheet open={edit !== null} item={edit} onClose={() => setEdit(null)} />
    </>
  )
}

/** The nightly snapshot on x1 (scripts/backup-x1.sh via cron). Goes red when the newest one is over 36 hours old. */
function BackupRow() {
  const q = useQuery({ queryKey: ['backups'], queryFn: api.backups, staleTime: 60_000 })
  const l = q.data?.latest
  const at = l ? new Date(l.at) : null
  const stale = !!at && Date.now() - at.getTime() > 36 * 3600_000
  const when = at ? `${dayLabel(toISO(at))}, ${at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''
  const value = q.isError ? <span className="secondary">Can't check right now</span>
    : !q.data ? undefined
    : !l ? <span className="neg">None found</span>
    : <span className={stale ? 'neg' : 'secondary'}>{when}</span>
  const hint = !q.data ? undefined
    : !l || stale ? 'The nightly backup has stopped. Check the cron job on x1 (crontab -l) and scripts/backup-x1.sh.'
    : `${q.data.count} nightly ${q.data.count === 1 ? 'copy' : 'copies'} kept on x1 (up to 30). The Mac copies them to iCloud each morning.`
  return <FieldRow label="Last backup" value={value} placeholder="Checking…" hint={hint} />
}

function General({ settings, categories }: { settings: Record<string, string>; categories: AdminCategory[] }) {
  const qc = useQueryClient()
  const toast = useToast()
  // Picked by id, so renaming the category keeps the Roth widget and month-end interest pointed at it.
  const [rothCat, setRothCat] = useState(settings.roth_category ?? '')
  const [intCat, setIntCat] = useState(settings.interest_category ?? '')
  const [picker, setPicker] = useState<null | 'roth' | 'interest'>(null)
  const catOpts = (types: string[], current: string) => categories.filter((c) => types.includes(c.type) && (c.active || String(c.id) === current))
    .map((c) => { const v = categoryVisual(c); return { value: String(c.id), label: c.name, group: c.type, mark: <Mark Icon={v.Icon} color={v.color} size="sm" /> } })
  const catName = (id: string) => categories.find((c) => String(c.id) === id)?.name
  const [ef, setEf] = useState(settings.ef_months ?? '6')
  const [roth, setRoth] = useState((Number(settings.roth_limit ?? 0) / 100).toFixed(2))
  const [start, setStart] = useState(settings.start_month ?? '')
  const save = useMutation({
    mutationFn: () => api.putSettings({ ef_months: Number(ef), roth_limit: (parseDollars(roth) ?? 0) / 100, start_month: start, roth_category: rothCat || null, interest_category: intCat || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin'] }); qc.invalidateQueries({ queryKey: ['bootstrap'] }); toast.show({ message: 'Settings saved' }) },
  })
  return (
    <>
      <FieldGroup>
        <TextRow label="Emergency fund" value={ef} onChange={(e) => setEf(e.target.value)} {...numpad('whole')} placeholder="months" />
        <TextRow label="Roth IRA limit" value={roth} onChange={(e) => setRoth(e.target.value)} {...numpad('amount')} />
        <TextRow label="Log starts" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </FieldGroup>
      <FieldGroup title="Categories Tally watches">
        <FieldRow label="Roth IRA" value={catName(rothCat)} placeholder="None" onClick={() => setPicker('roth')} hint="Entries in this category count toward the Roth limit on Home." />
        <FieldRow label="Interest" value={catName(intCat)} placeholder="None" onClick={() => setPicker('interest')} hint="Month end logs savings interest into this category." />
      </FieldGroup>
      <Picker open={picker === 'roth'} onClose={() => setPicker(null)} title="Roth IRA contributions" options={catOpts(['Saving', 'Transfer'], rothCat)} value={rothCat || null} noneLabel="None" onChange={setRothCat} />
      <Picker open={picker === 'interest'} onClose={() => setPicker(null)} title="Interest income" options={catOpts(['Money in'], intCat)} value={intCat || null} noneLabel="None" onChange={setIntCat} />
      <p className="secondary">Emergency fund goal = average monthly spending over completed months × this many months. The log start is the first month balances are computed from ({start ? monthLabel(start) : '—'}).</p>
      <button type="button" className={s.primary} onClick={() => save.mutate()} disabled={save.isPending}>Save</button>
    </>
  )
}
