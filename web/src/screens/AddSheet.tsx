import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Camera, Split as SplitIcon, Trash2, X } from 'lucide-react'
import { api, ApiError, unreachable, type Category, type Favorite, type Txn, type TxnInput } from '@/api/client'
import { useBootstrap, useLookups, useTransactions } from '@/lib/data'
import { SHAPES, HINT, fits } from '@/lib/shapes'
import { todayISO, addDays, dayLabel } from '@/lib/dates'
import { formatCents, parseDollars } from '@/lib/money'
import { shrinkImage } from '@/lib/image'
import { markRecent } from '@/lib/recent'
import { enqueue, newClientId, send } from '@/lib/outbox'
import { categoryVisual } from '@/icons/categories'
import { bankColor } from '@/icons/banks'
import { Sheet } from '@/components/Sheet'
import { Amount } from '@/components/Amount'
import { Keypad, applyKey, type Key } from '@/components/Keypad'
import { FieldGroup, FieldRow, TextRow } from '@/components/Field'
import { Picker, type Option } from '@/components/Picker'
import { Chip, ChipRow } from '@/components/Chip'
import { Mark } from '@/components/Mark'
import { LogoButton } from '@/components/LogoButton'
import { useToast } from '@/components/Toast'
import s from './AddSheet.module.css'
import { numpad } from '@/components/NumPad'

export interface Seed { favorite?: Favorite; edit?: Txn; duplicate?: Txn }
interface Props { open: boolean; seed: Seed; onClose: () => void }

const errorText = (e: unknown) => e instanceof ApiError ? e.errors
  : unreachable(e) ? ["Can't reach Tally. Changes to saved entries need a connection; try again in a moment."] : [String(e)]
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
    const active = boot.data.categories.filter((c) => c.active)
    const spendingIds = new Set(active.filter((c) => c.type === 'Spending').map((c) => c.id))
    const top = [...counts.entries()].filter(([id]) => spendingIds.has(id)).sort((a, b) => b[1] - a[1])[0]?.[0]
    const defaultCat = top ?? active.find((c) => c.type === 'Spending')?.id ?? active[0]?.id ?? null
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
  const refund = splits ? splitTotal < 0 : neg

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
  const undo = (p: Promise<unknown>) => p.then(refresh, (e) => toast.show({ message: `Couldn't undo: ${e instanceof ApiError ? e.errors.join(' ') : e}`, tone: 'error' }))

  // networkMode 'always': React Query would otherwise hold the save while the phone reports offline, and the
  // outbox needs the attempt to fail so it can queue the entry.
  const save = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      const body = payload()
      let saved: Txn
      if (seed.edit) {
        saved = await api.updateTxn(seed.edit.id, body)
        savedIds.current = [saved.id]
      } else {
        // New entries carry a client id, so if Tally is out of reach they can wait in the outbox and post later.
        const lines = splits ? splits.map((l) => ({ ...body, category_id: l.category_id!, amount: parseDollars(l.amount)! })) : [body]
        const cid = newClientId()
        let created: Txn | Txn[]
        try {
          created = await send(lines, cid)
        } catch (e) {
          if (!unreachable(e)) throw e
          if (file) throw new ApiError(0, ["Can't reach Tally, and receipts need a connection. Remove the photo to save the entry for later."])
          // Tally can't check it now, so catch what it would refuse before the entry waits in the queue.
          if (category && !fits(body, category.type)) throw new ApiError(0, [body.from_id && body.from_id === body.to_id ? 'From and To are the same account.' : `Check From and To. ${HINT[category.type]}`])
          enqueue({ cid, lines, label: `${formatCents(Math.abs(cents))} ${body.what || category?.name || ''}`.trim() })
          return { saved: null, receiptError: null }
        }
        const rows = Array.isArray(created) ? created : [created]
        savedIds.current = rows.map((c) => c.id)
        saved = { ...rows[0], amount: cents }
      }
      // The entry is saved at this point: a failed upload must not keep the sheet open (Save again = a duplicate).
      let receiptError: string | null = null
      if (file) {
        try { const { blob, name } = await shrinkImage(file); await api.uploadReceipt(saved.id, blob, name) }
        catch (e) { receiptError = e instanceof ApiError ? e.errors.join(' ') : String(e) }
      }
      return { saved, receiptError }
    },
    onSuccess: ({ saved, receiptError }) => {
      if (!saved) { onClose(); toast.show({ message: "Saved offline. It'll sync when Tally is back." }); return }
      refresh(); onClose(); markRecent(savedIds.current)
      if (receiptError) { toast.show({ message: `Saved, but the receipt didn't upload: ${receiptError}`, tone: 'error' }); return }
      const label = `${formatCents(Math.abs(saved.amount))} · ${saved.what || category?.name}${savedIds.current.length > 1 ? ` · ${savedIds.current.length} lines` : ''}`
      const before = seed.edit
      const ids = [...savedIds.current]
      toast.show({
        message: before ? `Updated ${label}` : `Added ${label}`,
        action: before
          ? { label: 'Undo', onClick: () => undo(api.updateTxn(before.id, { ...before })) }
          : { label: 'Undo', onClick: () => undo(Promise.all(ids.map((id) => api.deleteTxn(id)))) },
      })
    },
    onError: (e) => setErrors(errorText(e)),
  })

  const remove = useMutation({
    mutationFn: () => api.deleteTxn(seed.edit!.id),
    onSuccess: (gone) => {
      refresh(); onClose()
      toast.show({ message: `Deleted ${formatCents(Math.abs(gone.amount))} · ${gone.what || lk.cat.get(gone.category_id)?.name}`,
        action: { label: 'Undo', onClick: () => undo(api.restore([gone])) } })
    },
    onError: (e) => setErrors(errorText(e)),
  })

  const canSaveRef = useRef(false)
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
      else if (e.key === 'Enter' && canSaveRef.current) save.mutate()
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  })

  if (!boot.data) return null
  const b = boot.data
  // Hidden categories/accounts stay out of the pickers, except the one this entry already uses.
  const catOption = (c: Category): Option => { const v = categoryVisual(c); return { value: String(c.id), label: c.name, group: c.type, mark: <Mark Icon={v.Icon} color={v.color} size="sm" /> } }
  const catOptions: Option[] = b.categories.filter((c) => c.active || c.id === cat).map(catOption)
  // Split lines share one From/To, so they stay within the entry's category type.
  const splitOptions: Option[] = b.categories.filter((c) => c.active && c.type === (category?.type ?? 'Spending')).map(catOption)
  const acctOptions = (forTo: boolean, current: number | null): Option[] => b.accounts.filter((a) => (a.active || a.id === current) && (forTo || a.kind !== 'loan'))
    .map((a) => ({ value: String(a.id), label: a.name, group: { cash: 'Cash', card: 'Cards', investment: 'Investments', loan: 'Loans' }[a.kind], mark: <i className={s.dot} style={{ background: bankColor(a) }} /> }))
  const acctValue = (id: number | null) => { const a = id ? lk.acct.get(id) : undefined; return a ? <><i className={s.dot} style={{ background: bankColor(a) }} />{a.name}</> : undefined }
  const catVis = category ? categoryVisual(category) : undefined
  const canSave = cents !== 0 && !!cat && splitsOk && !save.isPending
  canSaveRef.current = canSave

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
            <Amount cents={cents} size="display" tone={refund ? 'pos' : 'neutral'} sign={refund ? 'always' : 'never'} roll />
            {refund && <span className={`caps ${s.negLabel}`}>refund · money back</span>}
          </button>

          {errors.length > 0 && <div className={s.errors} role="alert">{errors.map((e) => <div key={e}>{e}</div>)}</div>}

          <FieldGroup>
            {!splits && <FieldRow label="Category" value={category?.name} mark={catVis && <Mark Icon={catVis.Icon} color={catVis.color} size="sm" />} onClick={() => { setPad(false); setPicker('cat') }} hint={category ? HINT[category.type] : undefined} />}
            {seed.edit?.split_group && <FieldRow label="Split" value={<span className="secondary">Part of a split purchase</span>} onClick={() => { onClose(); nav(`/activity?group=${seed.edit!.split_group}`) }} />}
            {shape.from !== 'blank' && <FieldRow label="From" value={acctValue(from)} placeholder={shape.from === 'optional' ? 'Optional' : 'Account'} onClick={() => { setPad(false); setPicker('from') }} />}
            {shape.to !== 'blank' && <FieldRow label="To" value={acctValue(to)} placeholder={shape.to === 'optional' ? 'Optional' : 'Account'} onClick={() => { setPad(false); setPicker('to') }} />}
            <TextRow label="What" value={what} onChange={(e) => setWhat(e.target.value)} onFocus={() => setPad(false)} placeholder="Chick-fil-A, Paycheck, Xcel…" autoCapitalize="sentences" autoComplete="off" enterKeyHint="done"
              suggestions={suggestions} onPick={pickSuggestion} trailing={what.trim() && <LogoButton what={what} fallback={catVis} />} />
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
                    <input className={`tnum ${s.splitAmt}`} {...numpad('money')} placeholder="0.00" value={l.amount} onFocus={() => setPad(false)} aria-label={`Line ${i + 1} amount`}
                      onChange={(e) => setSplits(splits.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                    {splits.length > 2 && <button type="button" className={s.splitRemove} onClick={() => setSplits(splits.filter((_, j) => j !== i))} aria-label="Remove line"><X strokeWidth={2.5} absoluteStrokeWidth /></button>}
                  </div>) })}
              <div className={s.splitFoot}>
                <button type="button" className={s.moreBtn} onClick={() => setSplits([...splits, { category_id: null, amount: '' }])}>Add line</button>
                <button type="button" className={s.moreBtn} onClick={() => { setSplits(null); setPad(true) }}>Don't split</button>
              </div>
            </FieldGroup>
          ) : (
            <button type="button" className={s.moreBtn} onClick={() => { setSplits([{ category_id: cat, amount: digits ? ((neg ? -1 : 1) * Number(digits) / 100).toFixed(2) : '' }, { category_id: null, amount: '' }]); setNeg(false); setPad(false) }}>
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
      <Picker open={picker === 'from'} onClose={() => setPicker(null)} title="From" options={acctOptions(false, from)} value={from ? String(from) : null}
        noneLabel={shape.from === 'optional' ? 'None' : undefined} onChange={(v) => setFrom(v ? Number(v) : null)} />
      <Picker open={picker === 'to'} onClose={() => setPicker(null)} title="To" options={acctOptions(true, to)} value={to ? String(to) : null}
        noneLabel={shape.to === 'optional' ? 'None' : undefined} onChange={(v) => setTo(v ? Number(v) : null)} />
      <Picker open={splitPick !== null} onClose={() => setSplitPick(null)} title="Category" options={splitOptions} searchable
        value={splitPick !== null && splits?.[splitPick]?.category_id ? String(splits[splitPick].category_id) : null}
        onChange={(v) => setSplits((cur) => cur ? cur.map((x, j) => (j === splitPick ? { ...x, category_id: Number(v) } : x)) : cur)} />
    </>
  )
}
