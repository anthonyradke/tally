import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Camera, Split as SplitIcon, Trash2, X } from 'lucide-react'
import { api, ApiError, type Favorite, type Txn, type TxnInput } from '@/api/client'
import { useBootstrap, useLookups, useTransactions } from '@/lib/data'
import { SHAPES, HINT } from '@/lib/shapes'
import { todayISO, addDays, dayLabel } from '@/lib/dates'
import { formatCents, parseDollars } from '@/lib/money'
import { shrinkImage } from '@/lib/image'
import { markRecent } from '@/lib/recent'
import { categoryVisual } from '@/icons/categories'
import { bankColor } from '@/icons/banks'
import { Sheet } from '@/components/Sheet'
import { Amount } from '@/components/Amount'
import { Keypad, applyKey, type Key } from '@/components/Keypad'
import { FieldGroup, FieldRow, TextRow } from '@/components/Field'
import { Picker, type Option } from '@/components/Picker'
import { Chip, ChipRow } from '@/components/Chip'
import { Mark } from '@/components/Mark'
import { useToast } from '@/components/Toast'
import s from './AddSheet.module.css'

export interface Seed { favorite?: Favorite; edit?: Txn; duplicate?: Txn }
interface Props { open: boolean; seed: Seed; onClose: () => void }

const toDigits = (cents: number) => (cents === 0 ? '' : String(Math.abs(cents)))

export function AddSheet({ open, seed, onClose }: Props) {
  const boot = useBootstrap()
  const lk = useLookups(boot.data)
  const qc = useQueryClient()
  const toast = useToast()
  const recent = useTransactions({ limit: 300 }, open)

  const [digits, setDigits] = useState('')
  const [neg, setNeg] = useState(false)
  const [cat, setCat] = useState<number | null>(null)
  const [from, setFrom] = useState<number | null>(null)
  const [to, setTo] = useState<number | null>(null)
  const [what, setWhat] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [tags, setTags] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [picker, setPicker] = useState<null | 'cat' | 'from' | 'to'>(null)
  const [pad, setPad] = useState(true)
  const [more, setMore] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [splits, setSplits] = useState<Array<{ category_id: number | null; amount: string }> | null>(null)
  const [splitPick, setSplitPick] = useState<number | null>(null)
  const touchedCat = useRef(false)
  const savedIds = useRef<number[]>([])
  const nav = useNavigate()

  // Reset from the seed each time the sheet opens.
  useEffect(() => {
    if (!open || !boot.data) return
    const e = seed.edit, f = seed.favorite, src = seed.edit ?? seed.duplicate  // duplicate prefills like edit but saves as new, dated today
    // Default to the spending category used most in the last 300 entries, else the first spending category.
    const counts = new Map<number, number>()
    for (const t of recent.data?.items ?? []) counts.set(t.category_id, (counts.get(t.category_id) ?? 0) + 1)
    const spendingIds = new Set(boot.data.categories.filter((c) => c.type === 'Spending').map((c) => c.id))
    const top = [...counts.entries()].filter(([id]) => spendingIds.has(id)).sort((a, b) => b[1] - a[1])[0]?.[0]
    const defaultCat = top ?? boot.data.categories.find((c) => c.type === 'Spending')?.id ?? boot.data.categories[0]?.id ?? null
    setDigits(src ? toDigits(src.amount) : f?.amount ? toDigits(f.amount) : '')
    setNeg(!!src && src.amount < 0)
    setCat(src?.category_id ?? f?.category_id ?? defaultCat)
    setFrom(src?.from_id ?? f?.from_account_id ?? null)
    setTo(src?.to_id ?? f?.to_account_id ?? null)
    setWhat(src?.what ?? (f ? f.label.split(' · ')[0] : ''))
    setDate(e?.date ?? todayISO())
    setNote(src?.note ?? ''); setTags(src?.tags.join(' ') ?? ''); setFile(null)
    setMore(!!(src?.note || src?.tags.length || e?.receipt))
    setPad(!(src || f?.amount)); setErrors([]); setSplits(null); touchedCat.current = !!(src || f)
  }, [open, seed, boot.data])

  const category = cat ? lk.cat.get(cat) : undefined
  const shape = category ? SHAPES[category.type] : SHAPES.Spending
  const splitTotal = splits ? splits.reduce((n, l) => n + (parseDollars(l.amount) ?? 0), 0) : 0
  const cents = splits ? splitTotal : (neg ? -1 : 1) * Number(digits || '0')
  const splitsOk = !splits || (splits.length >= 2 && splits.every((l) => l.category_id && parseDollars(l.amount)))

  // Merchant memory: recent descriptions matching what's typed, most recent first.
  const suggestions = useMemo(() => {
    const items = recent.data?.items ?? []
    const needle = what.trim().toLowerCase()
    if (needle.length < 2) return []
    const seen = new Set<string>(); const out: string[] = []
    for (const t of items) {
      const w = t.what.trim(); const k = w.toLowerCase()
      if (k && k !== needle && k.includes(needle) && !seen.has(k)) { seen.add(k); out.push(w) }
      if (out.length >= 5) break
    }
    return out
  }, [recent.data, what])

  const pickSuggestion = (w: string) => {
    setWhat(w)
    const t = recent.data?.items.find((x) => x.what.trim().toLowerCase() === w.toLowerCase())
    if (t && !touchedCat.current) { setCat(t.category_id); setFrom(t.from_id); setTo(t.to_id) }
  }

  const payload = (): TxnInput => ({
    date, what: what.trim(), category_id: cat ?? 0, amount: cents,
    from_id: shape.from === 'blank' ? null : from, to_id: shape.to === 'blank' ? null : to,
    note: note.trim(), tags: tags.split(/[\s,]+/).filter(Boolean),
    split_group: seed.edit?.split_group ?? null,
  })

  const refresh = () => { qc.invalidateQueries({ queryKey: ['transactions'] }); qc.invalidateQueries({ queryKey: ['bootstrap'] }) }

  const save = useMutation({
    mutationFn: async () => {
      const body = payload()
      let saved: Txn
      if (splits && !seed.edit) {
        const lines = splits.map((l) => ({ ...body, category_id: l.category_id!, amount: parseDollars(l.amount)! }))
        const created = await api.createSplit(lines)
        savedIds.current = created.map((c) => c.id)
        saved = { ...created[0], amount: splitTotal }
      } else {
        saved = seed.edit ? await api.updateTxn(seed.edit.id, body) : await api.createTxn(body)
        savedIds.current = [saved.id]
      }
      if (file) { const { blob, name } = await shrinkImage(file); await api.uploadReceipt(saved.id, blob, name) }
      return saved
    },
    onSuccess: (saved) => {
      refresh(); onClose(); markRecent(savedIds.current)
      const label = `${formatCents(Math.abs(saved.amount))} · ${saved.what || category?.name}${savedIds.current.length > 1 ? ` · ${savedIds.current.length} lines` : ''}`
      const before = seed.edit
      const ids = [...savedIds.current]
      toast.show({
        message: before ? `Updated ${label}` : `Added ${label}`,
        action: before
          ? { label: 'Undo', onClick: () => api.updateTxn(before.id, { ...before }).then(refresh) }
          : { label: 'Undo', onClick: () => Promise.all(ids.map((id) => api.deleteTxn(id))).then(refresh) },
      })
    },
    onError: (e) => setErrors(e instanceof ApiError ? e.errors : [String(e)]),
  })

  const remove = useMutation({
    mutationFn: () => api.deleteTxn(seed.edit!.id),
    onSuccess: () => {
      const gone = seed.edit!
      refresh(); onClose()
      toast.show({ message: `Deleted ${formatCents(Math.abs(gone.amount))} · ${gone.what}`,
        action: { label: 'Undo', onClick: () => api.createTxn({ ...gone }).then(refresh) } })
    },
    onError: (e) => setErrors(e instanceof ApiError ? e.errors : [String(e)]),
  })

  const onKey = (k: Key) => { if (k === 'neg') setNeg((n) => !n); else setDigits((d) => applyKey(d, k)) }

  // Hardware keyboard drives the keypad when no text field has focus.
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || picker) return
      if (/^\d$/.test(e.key)) { onKey(e.key as Key); setPad(true) }
      else if (e.key === 'Backspace') onKey('back')
      else if (e.key === '-') onKey('neg')
      else if (e.key === 'Enter' && !save.isPending) save.mutate()
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  })

  if (!boot.data) return null
  const b = boot.data
  const catOptions: Option[] = b.categories.map((c) => { const v = categoryVisual(c); return { value: String(c.id), label: c.name, group: c.type, mark: <Mark Icon={v.Icon} color={v.color} size="sm" /> } })
  const acctOptions = (forTo: boolean): Option[] => b.accounts.filter((a) => forTo || a.kind !== 'loan')
    .map((a) => ({ value: String(a.id), label: a.name, group: { cash: 'Cash', card: 'Cards', investment: 'Investments', loan: 'Loans' }[a.kind], mark: <i className={s.dot} style={{ background: bankColor(a) }} /> }))
  const acctValue = (id: number | null) => { const a = id ? lk.acct.get(id) : undefined; return a ? <><i className={s.dot} style={{ background: bankColor(a) }} />{a.name}</> : undefined }
  const catVis = category ? categoryVisual(category) : undefined
  const canSave = cents !== 0 && !!cat && splitsOk && !save.isPending

  return (
    <>
      <Sheet open={open} onClose={onClose} title={seed.edit ? 'Edit entry' : 'New entry'} tall
        action={<button type="button" className={`${s.save} ${canSave ? '' : s.saveOff}`} disabled={!canSave} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button>}
        footer={pad ? <div className={s.padDock}><Keypad onKey={onKey} negative={neg} /></div> : undefined}>
        <div className={s.body}>
          {!seed.edit && b.favorites.length > 0 && (
            <ChipRow className={s.quick}>
              {b.favorites.map((f) => { const c = lk.cat.get(f.category_id); const v = c && categoryVisual(c)
                return <Chip key={f.id} size="sm" leading={v && <Mark Icon={v.Icon} color={v.color} size="sm" />}
                  onClick={() => { setCat(f.category_id); setFrom(f.from_account_id); setTo(f.to_account_id); setWhat(f.label.split(' · ')[0]); if (f.amount) { setDigits(toDigits(f.amount)); setPad(false) } touchedCat.current = true }}>{f.label}</Chip> })}
            </ChipRow>
          )}

          <button type="button" className={s.amount} onClick={() => !splits && setPad(true)} aria-label="Edit amount">
            <Amount cents={cents} size="display" tone={neg ? 'pos' : 'neutral'} sign={neg ? 'always' : 'never'} roll />
            {neg && <span className={`caps ${s.negLabel}`}>refund · money back</span>}
          </button>

          {errors.length > 0 && <div className={s.errors} role="alert">{errors.map((e) => <div key={e}>{e}</div>)}</div>}

          <FieldGroup>
            {!splits && <FieldRow label="Category" value={category?.name} mark={catVis && <Mark Icon={catVis.Icon} color={catVis.color} size="sm" />} onClick={() => { setPad(false); setPicker('cat') }} hint={category ? HINT[category.type] : undefined} />}
            {seed.edit?.split_group && <FieldRow label="Split" value={<span className="secondary">Part of a split purchase</span>} onClick={() => { onClose(); nav(`/activity?group=${seed.edit!.split_group}`) }} />}
            {shape.from !== 'blank' && <FieldRow label="From" value={acctValue(from)} placeholder={shape.from === 'optional' ? 'Optional' : 'Account'} onClick={() => { setPad(false); setPicker('from') }} />}
            {shape.to !== 'blank' && <FieldRow label="To" value={acctValue(to)} placeholder={shape.to === 'optional' ? 'Optional' : 'Account'} onClick={() => { setPad(false); setPicker('to') }} />}
            <TextRow label="What" value={what} onChange={(e) => setWhat(e.target.value)} onFocus={() => setPad(false)} placeholder="Chick-fil-A, Paycheck, Xcel…" autoCapitalize="sentences" autoComplete="off" enterKeyHint="done"
              suggestions={suggestions} onPick={pickSuggestion} />
            <div className={s.dateRow}>
              <TextRow label="Date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} onFocus={() => setPad(false)} />
              <div className={`${s.dateChips} no-scrollbar`}>
                {[todayISO(), addDays(todayISO(), -1), addDays(todayISO(), -2)].map((d) => <Chip key={d} size="sm" selected={date === d} onClick={() => setDate(d)}>{dayLabel(d)}</Chip>)}
              </div>
            </div>
          </FieldGroup>

          {!seed.edit && (splits ? (
            <FieldGroup title="Split across categories">
              {splits.map((l, i) => { const c = l.category_id ? lk.cat.get(l.category_id) : undefined; const v = c && categoryVisual(c)
                return (
                  <div key={i} className={s.splitLine}>
                    <button type="button" className={s.splitCat} onClick={() => { setPad(false); setSplitPick(i) }}>
                      {v ? <Mark Icon={v.Icon} color={v.color} size="sm" /> : <span className={s.splitDot} />}<span className={c ? '' : s.placeholder}>{c?.name ?? 'Category'}</span>
                    </button>
                    <span className={s.splitCur}>$</span>
                    <input className={`tnum ${s.splitAmt}`} inputMode="decimal" placeholder="0.00" value={l.amount} onFocus={() => setPad(false)} aria-label={`Line ${i + 1} amount`}
                      onChange={(e) => setSplits(splits.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                    {splits.length > 2 && <button type="button" className={s.splitRemove} onClick={() => setSplits(splits.filter((_, j) => j !== i))} aria-label="Remove line"><X strokeWidth={2.5} absoluteStrokeWidth /></button>}
                  </div>) })}
              <div className={s.splitFoot}>
                <button type="button" className={s.moreBtn} onClick={() => setSplits([...splits, { category_id: null, amount: '' }])}>Add line</button>
                <button type="button" className={s.moreBtn} onClick={() => { setSplits(null); setPad(true) }}>Don't split</button>
              </div>
            </FieldGroup>
          ) : (
            <button type="button" className={s.moreBtn} onClick={() => { setSplits([{ category_id: cat, amount: digits ? (Number(digits) / 100).toFixed(2) : '' }, { category_id: null, amount: '' }]); setPad(false) }}>
              <SplitIcon strokeWidth={2} absoluteStrokeWidth style={{ width: 14, height: 14 }} />Split across categories
            </button>
          ))}

          {more ? (
            <FieldGroup title="Details">
              <TextRow label="Note" value={note} onChange={(e) => setNote(e.target.value)} onFocus={() => setPad(false)} placeholder="Anything worth remembering" autoComplete="off" />
              <TextRow label="Tags" value={tags} onChange={(e) => setTags(e.target.value)} onFocus={() => setPad(false)} placeholder="camping lex birthday" autoCapitalize="none" autoComplete="off" />
              <div className={s.receiptRow}>
                <span className={s.receiptLabel}>Receipt</span>
                {seed.edit?.receipt && !file ? (
                  <a className={s.thumbWrap} href={api.receiptUrl(seed.edit.receipt)} target="_blank" rel="noreferrer"><img className={s.thumb} src={api.receiptUrl(seed.edit.receipt)} alt="Receipt" /></a>
                ) : file ? (
                  <span className={s.fileName}>{file.name}<button type="button" className={s.clearFile} onClick={() => setFile(null)} aria-label="Remove file"><X strokeWidth={2.5} absoluteStrokeWidth /></button></span>
                ) : null}
                <label className={s.camera}><Camera strokeWidth={2} absoluteStrokeWidth /><input type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} hidden /></label>
              </div>
            </FieldGroup>
          ) : (
            <button type="button" className={s.moreBtn} onClick={() => { setMore(true); setPad(false) }}>Add note, tags or receipt</button>
          )}

          {seed.edit && (
            <button type="button" className={s.delete} onClick={() => remove.mutate()} disabled={remove.isPending}><Trash2 strokeWidth={2} absoluteStrokeWidth />Delete entry</button>
          )}
        </div>
      </Sheet>

      <Picker open={picker === 'cat'} onClose={() => setPicker(null)} title="Category" options={catOptions} value={cat ? String(cat) : null} searchable
        onChange={(v) => { setCat(Number(v)); touchedCat.current = true }} />
      <Picker open={picker === 'from'} onClose={() => setPicker(null)} title="From" options={acctOptions(false)} value={from ? String(from) : null}
        noneLabel={shape.from === 'optional' ? 'None' : undefined} onChange={(v) => setFrom(v ? Number(v) : null)} />
      <Picker open={picker === 'to'} onClose={() => setPicker(null)} title="To" options={acctOptions(true)} value={to ? String(to) : null}
        noneLabel={shape.to === 'optional' ? 'None' : undefined} onChange={(v) => setTo(v ? Number(v) : null)} />
      <Picker open={splitPick !== null} onClose={() => setSplitPick(null)} title="Category" options={catOptions} searchable
        value={splitPick !== null && splits?.[splitPick]?.category_id ? String(splits[splitPick].category_id) : null}
        onChange={(v) => setSplits((cur) => cur ? cur.map((x, j) => (j === splitPick ? { ...x, category_id: Number(v) } : x)) : cur)} />
    </>
  )
}
