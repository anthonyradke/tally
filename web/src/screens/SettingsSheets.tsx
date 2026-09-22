import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { api, ApiError, type Account, type AdminAccount, type AdminCategory, type Favorite, type Freq, type Recurring, type SavedView, type CatType } from '@/api/client'
import { useBootstrap } from '@/lib/data'
import { parseDollars } from '@/lib/money'
import { SHAPES } from '@/lib/shapes'
import { todayISO } from '@/lib/dates'
import { categoryVisual } from '@/icons/categories'
import { GLYPHS, GLYPH_NAMES, TINTS, tintVar } from '@/icons/glyphs'
import { bankColor, BANKS, KIND_OPTIONS } from '@/icons/banks'
import { Sheet } from '@/components/Sheet'
import { FieldGroup, FieldRow, TextRow, ToggleRow } from '@/components/Field'
import { Picker, type Option } from '@/components/Picker'
import { Mark } from '@/components/Mark'
import { useToast } from '@/components/Toast'
import s from './SettingsSheets.module.css'
import { numpad } from '@/components/NumPad'

const TYPES: CatType[] = ['Spending', 'Money in', 'Saving', 'Transfer', 'Loan']
const FREQS: Array<{ value: Freq; label: string }> = [{ value: 'weekly', label: 'Weekly' }, { value: 'biweekly', label: 'Every 2 weeks' }, { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]

/** Shared plumbing: save/delete mutations, error banner, header Save button, footer Delete. */
function useEntity<T>(opts: { save: () => Promise<T>; remove?: () => Promise<void>; onDone: () => void; label: string }) {
  const qc = useQueryClient(); const toast = useToast()
  const [errors, setErrors] = useState<string[]>([])
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin'] }); qc.invalidateQueries({ queryKey: ['bootstrap'] }); qc.invalidateQueries({ queryKey: ['transactions'] }) }
  const onError = (e: unknown) => setErrors(e instanceof ApiError ? e.errors : [String(e)])
  const save = useMutation({ mutationFn: opts.save, onSuccess: () => { refresh(); opts.onDone(); toast.show({ message: `${opts.label} saved` }) }, onError })
  const remove = useMutation({ mutationFn: async () => { await opts.remove?.() }, onSuccess: () => { refresh(); opts.onDone(); toast.show({ message: `${opts.label} deleted` }) }, onError })
  return { save, remove, errors, setErrors }
}

// Full height so the text fields already sit above where the keyboard lands. A short sheet made iOS scroll the whole
// installed app to reveal the field, and it didn't restore the window height afterwards (lib/keyboard.ts).
function Frame({ open, onClose, title, canSave, saving, onSave, onDelete, errors, children }: { open: boolean; onClose: () => void; title: string; canSave: boolean; saving: boolean; onSave: () => void; onDelete?: () => void; errors: string[]; children: ReactNode }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} tall action={<button type="button" className={`${s.save} ${canSave ? '' : s.off}`} disabled={!canSave || saving} onClick={onSave}>{saving ? 'Saving…' : 'Save'}</button>}>
      <div className={s.body}>
        {errors.length > 0 && <div className={s.errors} role="alert">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
        {children}
        {onDelete && <button type="button" className={s.delete} onClick={onDelete}><Trash2 strokeWidth={2} absoluteStrokeWidth />Delete</button>}
      </div>
    </Sheet>
  )
}

function TintRow({ value, onChange, allowNone }: { value: string | null; onChange: (t: string | null) => void; allowNone?: boolean }) {
  return (
    <div className={s.tints} role="radiogroup" aria-label="Tint">
      {allowNone && <button type="button" role="radio" aria-checked={value === null} className={`${s.tint} ${value === null ? s.tintOn : ''}`} style={{ background: 'var(--surface-3)' }} onClick={() => onChange(null)} aria-label="Default" />}
      {TINTS.map((t) => <button key={t} type="button" role="radio" aria-checked={value === t} className={`${s.tint} ${value === t ? s.tintOn : ''}`} style={{ background: tintVar(t) }} onClick={() => onChange(t)} aria-label={t} />)}
    </div>
  )
}

function GlyphGrid({ value, color, onChange }: { value: string; color: string; onChange: (g: string) => void }) {
  return (
    <div className={s.glyphs} role="radiogroup" aria-label="Glyph">
      {GLYPH_NAMES.map((g) => <button key={g} type="button" role="radio" aria-checked={value === g} className={`${s.glyph} ${value === g ? s.glyphOn : ''}`} onClick={() => onChange(g)} aria-label={g}><Mark Icon={GLYPHS[g]} color={color} size="sm" /></button>)}
    </div>
  )
}

// ---------- Account ----------
export function AccountSheet({ open, item, onClose }: { open: boolean; item: AdminAccount | null; onClose: () => void }) {
  const blank = { name: '', kind: 'cash', bank: '', start: '0.00', apy: '', rate: '', ef: false, active: true, color: null as string | null }
  const [f, setF] = useState(blank)
  const [init, setInit] = useState(blank)
  const [picker, setPicker] = useState<null | 'kind' | 'bank'>(null)
  useEffect(() => { if (open) { const v = { name: item?.name ?? '', kind: item?.kind ?? 'cash', bank: item?.bank ?? '', start: item ? (item.start_balance / 100).toFixed(2) : '0.00', apy: item?.apy ? (item.apy * 100).toFixed(2) : '', rate: item?.loan_rate ? (item.loan_rate * 100).toFixed(3) : '', ef: item?.ef ?? false, active: item ? item.active !== 0 : true, color: item?.color ?? null }; setF(v); setInit(v) } }, [open, item])
  // The fields show rates rounded; only send one the user changed, so saving a name can't nudge a precise rate.
  const rates = { ...(f.apy !== init.apy || !item ? { apy: f.apy || null } : {}), ...(f.rate !== init.rate || !item ? { loan_rate: f.rate || null } : {}) }
  const ent = useEntity({ label: 'Account', onDone: onClose,
    save: () => api.saveAccount({ name: f.name, kind: f.kind, bank: f.bank || null, start_balance: (parseDollars(f.start) ?? 0) / 100, ...rates, ef: f.ef, active: f.active, color: f.color }, item?.id),
    remove: item ? () => api.deleteAccount(item.id) : undefined })
  const kindOpts: Option[] = KIND_OPTIONS.map((k) => ({ value: k.value, label: k.label, hint: k.hint }))
  const bankOpts: Option[] = [{ value: '', label: 'None' }, ...BANKS.map((b) => ({ value: b.value, label: b.label, mark: <i className={s.dot} style={{ background: `var(--bank-${b.value})` }} /> }))]
  return (
    <>
      <Frame open={open} onClose={onClose} title={item ? 'Edit account' : 'New account'} canSave={!!f.name.trim()} saving={ent.save.isPending} onSave={() => ent.save.mutate()} onDelete={item ? () => ent.remove.mutate() : undefined} errors={ent.errors}>
        <FieldGroup>
          <TextRow label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Chase Checking" autoFocus={!item} />
          <FieldRow label="Kind" value={KIND_OPTIONS.find((k) => k.value === f.kind)?.label} onClick={() => setPicker('kind')}
            hint={item && f.kind !== init.kind ? 'Every past month is recomputed with the new kind; its balance history will change.' : undefined} />
          <FieldRow label="Bank" value={f.bank ? BANKS.find((b) => b.value === f.bank)?.label : 'None'} mark={<i className={s.dot} style={{ background: bankColor({ bank: f.bank || null, kind: f.kind as Account['kind'], color: f.color }) }} />} onClick={() => setPicker('bank')} hint="Bank sets the dot color unless a tint is chosen below." />
          <div className={s.padRow}><span className={s.label}>Tint</span><TintRow value={f.color} onChange={(c) => setF({ ...f, color: c })} allowNone /></div>
        </FieldGroup>
        <FieldGroup title="Balances">
          <TextRow label="Starting" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} {...numpad('money')} />
          {f.kind === 'cash' && <TextRow label="APY %" value={f.apy} onChange={(e) => setF({ ...f, apy: e.target.value })} {...numpad('amount')} placeholder="4.00 for a HYSA" />}
          {f.kind === 'loan' && <TextRow label="Rate %" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} {...numpad('amount')} placeholder="annual" />}
          {f.kind === 'cash' && <ToggleRow label="Counts toward emergency fund" checked={f.ef} onChange={(v) => setF({ ...f, ef: v })} />}
          <ToggleRow label="Active" checked={f.active} onChange={(v) => setF({ ...f, active: v })} hint="Hidden accounts keep their history but leave the pickers." />
        </FieldGroup>
      </Frame>
      <Picker open={picker === 'kind'} onClose={() => setPicker(null)} title="Kind" options={kindOpts} value={f.kind} onChange={(v) => setF({ ...f, kind: v })} />
      <Picker open={picker === 'bank'} onClose={() => setPicker(null)} title="Bank" options={bankOpts} value={f.bank} onChange={(v) => setF({ ...f, bank: v })} />
    </>
  )
}

// ---------- Category ----------
export function CategorySheet({ open, item, onClose }: { open: boolean; item: AdminCategory | null; onClose: () => void }) {
  const [f, setF] = useState({ name: '', type: 'Spending' as CatType, icon: null as string | null, color: null as string | null, budget: '', active: true })
  const [picker, setPicker] = useState(false)
  useEffect(() => { if (open) setF({ name: item?.name ?? '', type: item?.type ?? 'Spending', icon: item?.icon ?? null, color: item?.color ?? null, budget: item?.budget ? (item.budget / 100).toFixed(2) : '', active: item ? item.active !== 0 : true }) }, [open, item])
  const ent = useEntity({ label: 'Category', onDone: onClose,
    save: () => api.saveCategory({ name: f.name, type: f.type, icon: f.icon, color: f.color, budget: f.budget ? (parseDollars(f.budget) ?? 0) / 100 : null, active: f.active }, item?.id),
    remove: item ? () => api.deleteCategory(item.id) : undefined })
  const vis = categoryVisual({ name: f.name || item?.name || '', type: f.type, icon: f.icon, color: f.color })
  return (
    <>
      <Frame open={open} onClose={onClose} title={item ? 'Edit category' : 'New category'} canSave={!!f.name.trim()} saving={ent.save.isPending} onSave={() => ent.save.mutate()} onDelete={item ? () => ent.remove.mutate() : undefined} errors={ent.errors}>
        <div className={s.preview}><Mark Icon={vis.Icon} color={vis.color} size="lg" /><span className={s.previewName}>{f.name || 'Category'}</span></div>
        <FieldGroup>
          <TextRow label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Dining Out" autoFocus={!item} />
          <FieldRow label="Type" value={f.type} onClick={() => setPicker(true)}
            hint={item && f.type !== item.type ? `Past entries in this category will count as ${f.type} in every month's totals.` : undefined} />
          {f.type === 'Spending' && <TextRow label="Budget / mo" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} {...numpad('amount')} placeholder="none" />}
          <ToggleRow label="Active" checked={f.active} onChange={(v) => setF({ ...f, active: v })} hint="Hidden categories keep their entries and totals but leave the pickers." />
        </FieldGroup>
        <FieldGroup title="Tint"><div className={s.padRow}><TintRow value={f.color} onChange={(c) => setF({ ...f, color: c })} allowNone /></div></FieldGroup>
        <FieldGroup title="Glyph"><GlyphGrid value={vis.glyph} color={vis.color} onChange={(g) => setF({ ...f, icon: g })} /></FieldGroup>
      </Frame>
      <Picker open={picker} onClose={() => setPicker(false)} title="Type" options={TYPES.map((t) => ({ value: t, label: t }))} value={f.type} onChange={(v) => setF({ ...f, type: v as CatType })} />
    </>
  )
}

// ---------- Quick action / recurring shared bits ----------
/** Category + account options (hidden ones only when already chosen), and which of From/To the category allows:
 *  a paycheck has no From, spending has no To. Both editors used to offer both for everything. */
function usePickers(categoryId: number, from: number, to: number) {
  const b = useBootstrap().data
  const cat = b?.categories.find((c) => c.id === categoryId)
  const shape = SHAPES[cat?.type ?? 'Spending']
  const catOpts: Option[] = (b?.categories ?? []).filter((c) => c.active || c.id === categoryId).map((c) => { const v = categoryVisual(c); return { value: String(c.id), label: c.name, group: c.type, mark: <Mark Icon={v.Icon} color={v.color} size="sm" /> } })
  const acctOpts = (current: number): Option[] => [{ value: '0', label: 'None' }, ...(b?.accounts ?? []).filter((a) => a.active || a.id === current).map((a) => ({ value: String(a.id), label: a.name, mark: <i className={s.dot} style={{ background: bankColor(a) }} /> }))]
  const acctName = (id: number) => b?.accounts.find((a) => a.id === id)?.name
  // Blank sides are dropped on save, so switching category never leaves a stale account behind.
  const sides = { from_account_id: shape.from === 'blank' ? null : from || null, to_account_id: shape.to === 'blank' ? null : to || null }
  const complete = (shape.from !== 'required' || !!sides.from_account_id) && (shape.to !== 'required' || !!sides.to_account_id)
  return { b, cat, shape, catOpts, acctOpts, acctName, sides, complete }
}

// ---------- Quick action ----------
export function FavoriteSheet({ open, item, onClose }: { open: boolean; item: Favorite | null; onClose: () => void }) {
  const boot = useBootstrap()
  const [f, setF] = useState({ label: '', category_id: 0, from: 0, to: 0, amount: '' })
  const [picker, setPicker] = useState<null | 'cat' | 'from' | 'to'>(null)
  useEffect(() => { if (open) setF({ label: item?.label ?? '', category_id: item?.category_id ?? boot.data?.categories.find((c) => c.type === 'Spending' && c.active)?.id ?? 0, from: item?.from_account_id ?? 0, to: item?.to_account_id ?? 0, amount: item?.amount ? (item.amount / 100).toFixed(2) : '' }) }, [open, item, boot.data])
  const p = usePickers(f.category_id, f.from, f.to)
  const ent = useEntity({ label: 'Quick action', onDone: onClose,
    save: () => api.saveFavorite({ label: f.label, category_id: f.category_id, ...p.sides, amount: f.amount ? (parseDollars(f.amount) ?? 0) / 100 : null, sort: item?.sort ?? 99 }, item?.id),
    remove: item ? () => api.deleteFavorite(item.id) : undefined })
  if (!p.b) return null
  const { cat, shape } = p
  return (
    <>
      <Frame open={open} onClose={onClose} title={item ? 'Edit quick action' : 'New quick action'} canSave={!!f.label.trim() && !!f.category_id} saving={ent.save.isPending} onSave={() => ent.save.mutate()} onDelete={item ? () => ent.remove.mutate() : undefined} errors={ent.errors}>
        <FieldGroup>
          <TextRow label="Label" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Gas · Amex" autoFocus={!item} />
          <FieldRow label="Category" value={cat?.name} mark={cat && <Mark Icon={categoryVisual(cat).Icon} color={categoryVisual(cat).color} size="sm" />} onClick={() => setPicker('cat')} />
          {shape.from !== 'blank' && <FieldRow label="From" value={p.acctName(f.from)} placeholder="Optional" onClick={() => setPicker('from')} />}
          {shape.to !== 'blank' && <FieldRow label="To" value={p.acctName(f.to)} placeholder="Optional" onClick={() => setPicker('to')} />}
          <TextRow label="Amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} {...numpad('money')} placeholder="Leave blank to type each time" />
        </FieldGroup>
      </Frame>
      <Picker open={picker === 'cat'} onClose={() => setPicker(null)} title="Category" options={p.catOpts} value={String(f.category_id)} searchable onChange={(v) => setF({ ...f, category_id: Number(v) })} />
      <Picker open={picker === 'from'} onClose={() => setPicker(null)} title="From" options={p.acctOpts(f.from)} value={String(f.from)} onChange={(v) => setF({ ...f, from: Number(v) })} />
      <Picker open={picker === 'to'} onClose={() => setPicker(null)} title="To" options={p.acctOpts(f.to)} value={String(f.to)} onChange={(v) => setF({ ...f, to: Number(v) })} />
    </>
  )
}

// ---------- Recurring ----------
export function RecurringSheet({ open, item, onClose }: { open: boolean; item: Recurring | null; onClose: () => void }) {
  const boot = useBootstrap()
  const [f, setF] = useState({ label: '', what: '', category_id: 0, from: 0, to: 0, amount: '', freq: 'monthly' as Freq, next: todayISO(), active: true })
  const [picker, setPicker] = useState<null | 'cat' | 'from' | 'to' | 'freq'>(null)
  useEffect(() => { if (open) setF({ label: item?.label ?? '', what: item?.what ?? '', category_id: item?.category_id ?? boot.data?.categories.find((c) => c.type === 'Spending' && c.active)?.id ?? 0, from: item?.from_account_id ?? 0, to: item?.to_account_id ?? 0, amount: item ? (item.amount / 100).toFixed(2) : '', freq: item?.freq ?? 'monthly', next: item?.next_date ?? todayISO(), active: item ? item.active !== 0 : true }) }, [open, item, boot.data])
  const p = usePickers(f.category_id, f.from, f.to)
  const ent = useEntity({ label: 'Recurring', onDone: onClose,
    save: () => api.saveRecurring({ label: f.label, what: f.what, category_id: f.category_id, ...p.sides, amount: (parseDollars(f.amount) ?? 0) / 100, freq: f.freq, next_date: f.next, active: f.active }, item?.id),
    remove: item ? () => api.deleteRecurring(item.id) : undefined })
  if (!p.b) return null
  const { cat, shape } = p
  const side = (rule: string) => (rule === 'required' ? 'Account' : 'Optional')
  return (
    <>
      <Frame open={open} onClose={onClose} title={item ? 'Edit recurring' : 'New recurring'} canSave={!!f.label.trim() && !!f.category_id && !!parseDollars(f.amount) && p.complete} saving={ent.save.isPending} onSave={() => ent.save.mutate()} onDelete={item ? () => ent.remove.mutate() : undefined} errors={ent.errors}>
        <FieldGroup>
          <TextRow label="Label" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Phone" autoFocus={!item} />
          <TextRow label="Amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} {...numpad('money')} placeholder="57.00" />
          <FieldRow label="Category" value={cat?.name} mark={cat && <Mark Icon={categoryVisual(cat).Icon} color={categoryVisual(cat).color} size="sm" />} onClick={() => setPicker('cat')} />
          {shape.from !== 'blank' && <FieldRow label="From" value={p.acctName(f.from)} placeholder={side(shape.from)} onClick={() => setPicker('from')} />}
          {shape.to !== 'blank' && <FieldRow label="To" value={p.acctName(f.to)} placeholder={side(shape.to)} onClick={() => setPicker('to')} />}
        </FieldGroup>
        <FieldGroup title="Schedule">
          <FieldRow label="Repeats" value={FREQS.find((x) => x.value === f.freq)?.label} onClick={() => setPicker('freq')} />
          <TextRow label="Next on" type="date" value={f.next} onChange={(e) => e.target.value && setF({ ...f, next: e.target.value })} />
          <TextRow label="Description" value={f.what} onChange={(e) => setF({ ...f, what: e.target.value })} placeholder="Defaults to the label" />
          <ToggleRow label="Active" checked={f.active} onChange={(v) => setF({ ...f, active: v })} hint="Paused templates stop posting; existing entries stay. Resuming picks up from the next date, without a backlog." />
        </FieldGroup>
      </Frame>
      <Picker open={picker === 'cat'} onClose={() => setPicker(null)} title="Category" options={p.catOpts} value={String(f.category_id)} searchable onChange={(v) => setF({ ...f, category_id: Number(v) })} />
      <Picker open={picker === 'from'} onClose={() => setPicker(null)} title="From" options={p.acctOpts(f.from)} value={String(f.from)} onChange={(v) => setF({ ...f, from: Number(v) })} />
      <Picker open={picker === 'to'} onClose={() => setPicker(null)} title="To" options={p.acctOpts(f.to)} value={String(f.to)} onChange={(v) => setF({ ...f, to: Number(v) })} />
      <Picker open={picker === 'freq'} onClose={() => setPicker(null)} title="Repeats" options={FREQS} value={f.freq} onChange={(v) => setF({ ...f, freq: v as Freq })} />
    </>
  )
}

// ---------- Saved view ----------
export function ViewSheet({ open, item, onClose }: { open: boolean; item: SavedView | null; onClose: () => void }) {
  const [name, setName] = useState('')
  useEffect(() => { if (open) setName(item?.name ?? '') }, [open, item])
  const ent = useEntity({ label: 'View', onDone: onClose, save: () => api.saveView({ name, query: item?.query ?? '', sort: item?.sort ?? 0 }, item?.id), remove: item ? () => api.deleteView(item.id) : undefined })
  return (
    <Frame open={open} onClose={onClose} title="Saved view" canSave={!!name.trim()} saving={ent.save.isPending} onSave={() => ent.save.mutate()} onDelete={item ? () => ent.remove.mutate() : undefined} errors={ent.errors}>
      <FieldGroup><TextRow label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></FieldGroup>
      <p className="secondary">Filters: <code className={s.code}>{item?.query || '—'}</code></p>
    </Frame>
  )
}
