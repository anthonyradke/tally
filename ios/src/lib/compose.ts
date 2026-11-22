// The new-entry composer's pure parts (app/new.tsx): what a quick action fills in, the places under "What was it?",
// and the words for the figure and the toast after Add.
import { merchantKey } from '@/icons/merchants'
import type { CatType, Favorite, Txn } from './api'
import { dayLabel } from './dates'
import { blank, fromCents, type Draft } from './draft'
import { formatCents } from './money'
import { SHAPES } from './shapes'
import { rowAmount, type Tone } from './txn'

/** The kind's name on the amount page's switch and under the figure on the review. */
export const KIND_NAME: Record<CatType, string> = { Spending: 'Spent', 'Money in': 'Income', Transfer: 'Transfer', Saving: 'Saving', Loan: 'Loan' }

type CatInfo = { type: CatType; name: string }

/** A quick action's label only names a place when it isn't just its category's name: a "Gas" chip under Gas would
 *  save every fill-up as "Gas", where the station belongs. */
export const namesPlace = (label: string, catName: string | undefined) => !!merchantKey(label) && merchantKey(label) !== merchantKey(catName ?? '')

/** What a quick action fills in. Its amount only when none has been typed yet (typing $4.50 and then tapping a $5.75
 *  Coffee chip kept $5.75); its label when it names a place or the chip has its own amount (a $1,400 "Rent" chip under
 *  Rent is that bill, and the repeats and budgets know it by that name). */
export function quickFill(f: Favorite, cat: CatInfo | undefined, typed: boolean): Partial<Draft> {
  return {
    what: f.amount || namesPlace(f.label, cat?.name) ? f.label : '', category_id: f.category_id, from_id: f.from_account_id, to_id: f.to_account_id,
    kind: cat?.type ?? 'Spending', ...(f.amount && !typed ? { amount: fromCents(f.amount), refund: f.amount < 0 } : {}),
  }
}

/** Every change of kind goes through here (the switch, a quick action, a past entry). A refund exists only on
 *  spending, so one carries over only while the kind stays the same, unless the change brings its own (a chip saved
 *  with a negative amount): a refund typed on Spending and then a Paycheck chip saved −$5 as income. */
export const withKind = (d: Draft, p: Partial<Draft> & { kind: CatType }): Partial<Draft> =>
  ({ ...p, refund: p.refund ?? (p.kind === d.kind && d.refund) })

/** The kind switch on the amount page. A category and accounts that no longer fit go; nothing is picked for you,
 *  except that the account it was opened from (`home`) moves to whichever side still fits. */
export function toKind(d: Draft, kind: CatType, catType: CatType | undefined, home: number | null): Partial<Draft> {
  const s = SHAPES[kind]
  let from_id = s.from === 'blank' ? null : d.from_id
  let to_id = s.to === 'blank' ? null : d.to_id
  if (home && from_id !== home && to_id !== home) {
    if (s.from === 'blank' && !to_id) to_id = home
    else if (s.to === 'blank' && !from_id) from_id = home
  }
  return withKind(d, { kind, category_id: catType === kind ? d.category_id : null, from_id, to_id })
}

/** Tapping a quick action. `gave`: the amount showing came from the chip tapped before, so it isn't yours and gives
 *  way (Coffee's $5.75 stayed when Lunch was tapped after it); with no amount of its own, this chip clears it.
 *  Returns the change and whether the amount is now the chip's. */
export function chipIn(d: Draft, f: Favorite, cat: CatInfo | undefined, o: { gave: boolean; summing: boolean }): { patch: Partial<Draft>; gave: boolean } {
  const fill = quickFill(f, cat, (!!d.amount && !o.gave) || o.summing)
  const drop = o.gave && !fill.amount ? { amount: '', refund: false } : {}
  return { patch: withKind(d, { ...drop, ...fill, kind: fill.kind ?? 'Spending' }), gave: !!fill.amount }
}

/** Tapping the picked quick action again: a blank draft on the same kind and day, with the account it was opened
 *  from, and the amount when you typed it rather than the chip. */
export function chipOut(d: Draft, gave: boolean, home: number | null): Draft {
  const side = SHAPES[d.kind].from === 'blank' ? { from_id: null, to_id: home } : { from_id: home, to_id: null }
  return { ...blank(d.date), kind: d.kind, ...side, ...(gave ? {} : { amount: d.amount, refund: d.refund }) }
}

/** Past places for "What was it?", one row per place. Typing matches every kind (a "Transfer to savings" filed under
 *  Saving turns up under Transfer too), this kind's first, a name typed in full at the top. With nothing typed, it's
 *  this kind's recent places, the picked category's most used first (a Gas chip shows the stations first). */
export function places(history: Txn[], catOf: (x: Txn) => CatInfo, o: { text: string; kind: CatType; category: number | null }, n = 8): Txn[] {
  const want = merchantKey(o.text)
  const by = new Map<string, { row: Txn; count: number; at: number; exact: boolean }>()
  history.forEach((x, at) => { // newest first, so the first row seen for a place is its latest
    const k = merchantKey(x.what)
    if (!k || (want && !k.startsWith(want))) return
    const c = catOf(x)
    if (!want && c.type !== o.kind) return
    const cur = by.get(k)
    if (!cur) { by.set(k, { row: x, count: 1, at, exact: k === want }); return }
    cur.count++
    if (want && c.type === o.kind && catOf(cur.row).type !== o.kind) cur.row = x // how it went under this kind, if it ever did
  })
  const of = (v: { row: Txn }) => catOf(v.row)
  // Rows named after their own category (left by a chip like "Gas") aren't places to suggest first.
  const usual = (v: { row: Txn }) => !!o.category && v.row.category_id === o.category && merchantKey(of(v).name) !== merchantKey(v.row.what)
  const rank = want
    ? (v: { row: Txn; exact: boolean }) => (v.exact ? 0 : 2) + (of(v).type === o.kind ? 0 : 1)
    : (v: { row: Txn }) => (usual(v) ? 0 : 1)
  return [...by.values()]
    .sort((a, z) => rank(a) - rank(z) || (!want && usual(a) ? z.count - a.count : 0) || a.at - z.at)
    .slice(0, n)
    .map((v) => v.row)
}

/** A name typed in full that is a past place of this kind (case and punctuation aside): Return on it acts like
 *  tapping its row. A place only seen under another kind isn't picked by Return, which would switch the kind unasked. */
export function exactPlace(history: Txn[], catOf: (x: Txn) => CatInfo, text: string, kind: CatType): Txn | undefined {
  const want = merchantKey(text)
  return want ? history.find((x) => merchantKey(x.what) === want && catOf(x).type === kind) : undefined
}

/** The figure as Activity will show it (lib/txn rowAmount): money in and refunds green with a +, spending plain,
 *  transfers, saving and loans with no sign, and a correction to money in with a −. */
export function signed(cents: number, kind: CatType, refund: boolean): { text: string; tone: Tone } {
  const r = rowAmount(kind, refund ? -cents : cents)
  return { text: formatCents(r.cents, { sign: r.sign }), tone: r.tone }
}

/** Add's label: "Add $5.40", "Add refund $62.26". */
export const addLabel = (cents: number, kind: CatType, refund: boolean) =>
  `Add ${refund && kind === 'Spending' ? 'refund ' : ''}${formatCents(Math.abs(cents))}`

/** The day an entry went on, inside the toast: "" for today, "yesterday", "tomorrow", else "on Sat, Nov 14". */
function onDay(iso: string, today: string): string {
  const l = dayLabel(iso, today)
  return l === 'Today' ? '' : l === 'Yesterday' || l === 'Tomorrow' ? l.toLowerCase() : `on ${l}`
}

/** The toast after Add: "Added $112.84 to Groceries", "Refunded $62.26 to Shopping", "Acme Corp, +$2,185.40 to
 *  Checking"; the day follows when it isn't today ("… to Groceries yesterday", "… on Sat, Nov 14"). */
export function addedText(o: { cents: number; kind: CatType; refund: boolean; what: string; category?: string; account?: string; date: string; today: string }): string {
  const day = onDay(o.date, o.today)
  const amount = formatCents(o.cents)
  let s: string
  if (o.kind === 'Money in' && !o.refund) {
    const into = `+${amount}${o.account ? ` to ${o.account}` : ''}`
    s = o.what.trim() ? `${o.what.trim()}, ${into}` : `Added ${into}`
  } else {
    s = `${o.refund ? 'Refunded' : 'Added'} ${amount}${o.category ? ` to ${o.category}` : ''}`
  }
  return day ? `${s} ${day}` : s
}
