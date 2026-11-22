// Recently deleted (Settings): telling the rows one delete removed from the rest, and the ones a search in Activity
// would have found.
import type { CatType, DeletedTxn, Txn, TxnQuery } from './api'

/** Deleted rows grouped by the delete that removed them, newest first (the list already comes newest first, a
 *  group's rows next to each other). `batch` marks one delete; rows from before it was kept only have the second
 *  they went, which two separate deletes can share. */
export function byDelete(rows: DeletedTxn[]): DeletedTxn[][] {
  const out: DeletedTxn[][] = []
  for (const r of rows) {
    const last = out[out.length - 1]
    if (last && last[0].deleted_at === r.deleted_at && (last[0].batch ?? null) === (r.batch ?? null)) last.push(r)
    else out.push([r])
  }
  return out
}

/** A listed row as /transactions/restore takes it back. */
export const asEntry = ({ deleted_at: _gone, batch: _batch, skipped_from: _skip, ...entry }: DeletedTxn) => entry

/** A group of one skipped date stands apart from the deletions: labelled with its template and put back with
 *  Unskip, so a cleanup doesn't bring back a bill skipped on purpose thinking it was a mistake. */
export const skippedFrom = (g: DeletedTxn[]): string | null => (g.length === 1 && g[0].skipped_from) || null

const MONTHS = new Set('jan january feb february mar march apr april may jun june jul july aug august sep sept september oct october nov november dec december'.split(' '))
/** Whether a search uses one of the shortcuts the server reads (app/search.py): >50, aug, today, last week, #trip. */
export function hasShortcut(q: string): boolean {
  const t = q.toLowerCase().split(/\s+/).filter(Boolean)
  return t.some((w, i) => /^(>=|<=|>|<)\$?\d/.test(w) || MONTHS.has(w) || w === 'today' || w === 'yesterday'
    || (w.length > 1 && w.startsWith('#')) || ((w === 'this' || w === 'last') && (t[i + 1] === 'week' || t[i + 1] === 'month')))
}

const plainText = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '')
const NUMBER = /^(-?)\$?(\d[\d,]{0,15}(?:\.\d{0,2})?|\.\d{1,2})$/
/** A number typed as search reads it: with cents only that amount, whole the amounts whose dollars start with it, and a
 *  leading − only negative amounts. */
function amountHit(w: string, amount: number): boolean {
  const n = NUMBER.exec(w)
  if (!n || (n[1] && amount >= 0)) return false
  const num = n[2].replace(/,/g, '').replace(/\.$/, '')
  return num.includes('.') ? Math.abs(amount) === Math.round(Number(num) * 100) : String(Math.floor(Math.abs(amount) / 100)).startsWith(String(Number(num)))
}

/** Deleted entries Activity's search would have found were they still in: every word in the name, note, tags or
 *  `names` (category, accounts), or a number in the amount, and inside the other filters that are on (type,
 *  category, account, dates, tag, split). So a search that finds nothing can point to one deleted lately. A search
 *  with a shortcut offers none: the server reads those, and a guess here could point to one it wouldn't find. */
export function deletedMatches<T extends Txn>(rows: T[], f: TxnQuery, typeOf: (r: T) => CatType, names: (r: T) => string[] = () => []): T[] {
  const q = f.q ?? ''
  if (hasShortcut(q)) return []
  const words = q.toLowerCase().split(/\s+/).filter((w) => plainText(w) || NUMBER.test(w))
  if (!words.length) return []
  const tag = f.tag?.toLowerCase().replace(/^#/, '')
  return rows.filter((r) => {
    if ((f.type && typeOf(r) !== f.type) || (f.category != null && r.category_id !== f.category)) return false
    if (f.account != null && r.from_id !== f.account && r.to_id !== f.account) return false
    if ((f.start && r.date < f.start) || (f.end && r.date > f.end)) return false
    if ((tag && !r.tags.includes(tag)) || (f.group && r.split_group !== f.group)) return false
    const hay = plainText([r.what, r.note, ...r.tags, ...names(r)].join(' '))
    return words.every((w) => amountHit(w, r.amount) || (!!plainText(w) && hay.includes(plainText(w))))
  })
}
