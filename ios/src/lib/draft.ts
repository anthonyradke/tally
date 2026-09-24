// The entry being composed. It lives in a store (not screen state) so the picker sheets stacked over the composer
// can edit it and the composer re-renders underneath.
import { create } from 'zustand'
import type { CatType, Txn, TxnInput } from './api'
import { todayISO } from './dates'
import { SHAPES } from './shapes'

export interface Line { key: string; category_id: number | null; amount: string }
export type Target = 'main' | string // 'main' or a split line key

export interface Draft {
  id?: number
  date: string
  what: string
  category_id: number | null
  from_id: number | null
  to_id: number | null
  /** What the keypad typed, e.g. "12.5". Cents come from `toCents`. */
  amount: string
  /** The amount is negative: a refund for spending, or a correction imported from the spreadsheet for other kinds. */
  refund: boolean
  note: string
  tags: string[]
  split: Line[] | null
  receipt: string | null          // server filename of an existing receipt
  photo: { uri: string; name: string; type: string } | null // new photo, uploaded after save
  removeReceipt: boolean
  kind: CatType
  target: Target
}

export const blank = (today = todayISO()): Draft => ({
  date: today, what: '', category_id: null, from_id: null, to_id: null, amount: '', refund: false, note: '', tags: [],
  split: null, receipt: null, photo: null, removeReceipt: false, kind: 'Spending', target: 'main',
})

/** "12.5" → 1250. Anything unparsable is 0. */
export const toCents = (s: string) => {
  const n = Number(s || '0')
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
export const fromCents = (c: number) => {
  const s = (Math.abs(c) / 100).toFixed(2)
  return s.endsWith('.00') ? s.slice(0, -3) : s
}

/** A keypad press applied to a typed amount: at most two decimals, no leading zeros, capped at $9,999,999. */
export function press(cur: string, key: string): string {
  if (key === 'del') return cur.slice(0, -1)
  if (key === '.') return cur.includes('.') ? cur : (cur || '0') + '.'
  const [, dec] = cur.split('.')
  if (dec !== undefined && dec.length >= 2) return cur
  const next = cur === '0' ? key : cur + key
  return Number(next) > 9_999_999 ? cur : next
}

export const fromTxn = (t: Txn, type: CatType): Draft => ({
  ...blank(t.date), id: t.id, date: t.date, what: t.what, category_id: t.category_id, from_id: t.from_id, to_id: t.to_id,
  amount: fromCents(t.amount), refund: t.amount < 0, note: t.note, tags: t.tags, receipt: t.receipt, kind: type,
})

interface S { d: Draft; set: (p: Partial<Draft>) => void; reset: (d: Draft) => void; setLine: (key: string, p: Partial<Line>) => void }
export const useDraft = create<S>((set) => ({
  d: blank(),
  set: (p) => set((s) => ({ d: { ...s.d, ...p } })),
  reset: (d) => set({ d }),
  setLine: (key, p) => set((s) => ({ d: { ...s.d, split: s.d.split?.map((l) => (l.key === key ? { ...l, ...p } : l)) ?? null } })),
}))

/** What Save sends: one line, or one per split line. Accounts a kind leaves blank are dropped; a refund is negative. */
export function toInputs(d: Draft): TxnInput[] {
  const shape = SHAPES[d.kind]
  const sign = d.refund ? -1 : 1
  const base = { date: d.date, what: d.what.trim(), from_id: shape.from === 'blank' ? null : d.from_id, to_id: shape.to === 'blank' ? null : d.to_id, note: d.note.trim(), tags: d.tags }
  return d.split
    ? d.split.map((l) => ({ ...base, category_id: l.category_id ?? 0, amount: toCents(l.amount) * sign }))
    : [{ ...base, category_id: d.category_id ?? 0, amount: toCents(d.amount) * sign }]
}
