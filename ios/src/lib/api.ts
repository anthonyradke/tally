// Typed client for the Tally backend (FastAPI on x1, reached over Tailscale). Amounts are integer cents everywhere in
// the app; request bodies carry dollars because the backend's `cents()` parser is the single source of rounding truth.
import { getServer } from './server'

export type Kind = 'cash' | 'card' | 'investment' | 'loan'
export type CatType = 'Money in' | 'Spending' | 'Saving' | 'Transfer' | 'Loan'
export type Freq = 'weekly' | 'biweekly' | 'monthly' | 'yearly'

export interface Account { id: number; name: string; kind: Kind; bank: string | null; start_balance: number; apy: number | null; loan_rate: number | null; ef: boolean; color: string | null; icon: string | null; active: boolean }
/** `active: false` = hidden in Settings: kept for existing entries and totals, left out of pickers. */
export interface Category { id: number; name: string; type: CatType; icon: string | null; color: string | null; budget: number | null; active: boolean }
export interface Txn { id: number; date: string; what: string; category_id: number; from_id: number | null; to_id: number | null; amount: number; note: string; tags: string[]; split_group: string | null; receipt: string | null; recurring_id: number | null }
export interface TxnInput { date: string; what: string; category_id: number; from_id: number | null; to_id: number | null; amount: number; note?: string; tags?: string[]; split_group?: string | null }
export interface Favorite { id: number; label: string; category_id: number; from_account_id: number | null; to_account_id: number | null; amount: number | null; sort: number; icon: string | null; color: string | null }
export interface Budget { category_id: number; month: string; amount: number }
export interface Recurring { id: number; label: string; category_id: number; from_account_id: number | null; to_account_id: number | null; amount: number; what: string; freq: Freq; next_date: string; horizon_days: number; active: number }
export interface SavedView { id: number; name: string; query: string; icon: string | null; sort: number }
export interface MonthRow { month: string; money_in: number; spent: number; loan: number; saving: number; left_over: number; by_category: Record<string, number>; balances: Record<string, number>; cash: number; invested: number; cards: number; loans: number; net_worth: number }
export interface Bootstrap { today: string; start: string; accounts: Account[]; categories: Category[]; favorites: Favorite[]; budgets: Budget[]; recurring: Recurring[]; saved_views: SavedView[]; settings: Record<string, string>; months: MonthRow[]; ef: { goal: number; progress: number }; roth: { ytd: number; limit: number; category_id: number | null } }
export interface TxnPage { total: number; sum: number; by_type: Partial<Record<CatType, number>>; items: Txn[] }
export interface TxnQuery { q?: string; category?: number; account?: number; type?: CatType | ''; start?: string; end?: string; amount_min?: number; amount_max?: number; tag?: string; group?: string; sort?: 'date' | 'amount'; dir?: 'asc' | 'desc'; limit?: number; offset?: number }
export interface Diagnosis { expected: number; actual: number; gap: number; saved: boolean; doubled: Txn[]; single: Txn[]; future: Txn[] }
export interface MonthEnd { month: string; typed: Record<string, number | null>; recon: Record<string, { actual: number; expected: number; date: string } | null>; interest: Record<string, { logged: Txn[]; proposed: number }>; typed_done: boolean; interest_done: boolean; recon_done: boolean }
export interface Reconciliation { id: number; account_id: number; date: string; actual: number; expected: number }
export interface Backups { latest: { name: string; size: number; at: string } | null; count: number; folder: string }
/** Settings rows straight from the tables: `active` is SQLite's 0/1 here. */
export type AdminAccount = Omit<Account, 'active'> & { sort: number; active: number }
export type AdminCategory = Omit<Category, 'active'> & { sort: number; active: number }
export interface AdminData { accounts: AdminAccount[]; categories: AdminCategory[]; favorites: Favorite[]; recurring: Recurring[]; saved_views: SavedView[]; budgets: Budget[]; settings: Record<string, string> }

export class ApiError extends Error {
  constructor(public status: number, public errors: string[]) { super(errors.join(' ')) }
}

/** True when the request never got an answer from Tally (no signal, Tailscale off, timed out, server restarting),
 *  as opposed to Tally refusing it. Only these are worth retrying. */
export const unreachable = (e: unknown) =>
  e instanceof ApiError ? e.status >= 502 : e instanceof TypeError || (e instanceof Error && e.name === 'AbortError')

async function call<T>(method: string, path: string, body?: unknown, timeoutMs = 15_000): Promise<T> {
  const isForm = body instanceof FormData
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${getServer()}/api${path}`, {
      method, signal: ctrl.signal,
      headers: body === undefined || isForm ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
    if (res.status === 204) return undefined as T
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const detail = data?.detail
      const errors: string[] = Array.isArray(detail?.errors) ? detail.errors : [typeof detail === 'string' ? detail : `Request failed (${res.status})`]
      throw new ApiError(res.status, errors)
    }
    return data as T
  } finally {
    clearTimeout(timer)
  }
}

const qs = (params: object) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== null) p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

const dollars = (t: TxnInput) => ({ ...t, amount: t.amount / 100 })

export const api = {
  bootstrap: () => call<Bootstrap>('GET', '/bootstrap'),
  admin: () => call<AdminData>('GET', '/admin'),
  transactions: (query: TxnQuery = {}) => call<TxnPage>('GET', `/transactions${qs(query)}`),
  /** `clientId` makes the create safe to retry: the server returns the row it already wrote for that id. */
  createTxn: (t: TxnInput, clientId?: string) => call<Txn>('POST', '/transactions', { ...dollars(t), client_id: clientId }, 12_000),
  createSplit: (lines: TxnInput[], clientId?: string) => call<Txn[]>('POST', '/transactions/split', { lines: lines.map(dollars), client_id: clientId }, 12_000),
  updateTxn: (id: number, t: TxnInput) => call<Txn>('PUT', `/transactions/${id}`, dollars(t)),
  /** Returns the row as it was, for Undo via `restore`. */
  deleteTxn: (id: number) => call<Txn>('DELETE', `/transactions/${id}`),
  /** Undo for deletes: puts rows back exactly (same id, receipt, split and recurring links). */
  restore: (rows: Txn[]) => call<Txn[]>('POST', '/transactions/restore', { rows: rows.map((t) => ({ ...t, amount: t.amount / 100 })) }),
  bulk: (body: { ids: number[]; action: 'delete' | 'recategorize' | 'tag'; category_id?: number; tags?: string[] }) =>
    call<{ ok: true; count: number; deleted?: Txn[] }>('POST', '/transactions/bulk', body),
  uploadReceipt: (id: number, file: { uri: string; name: string; type: string }) => {
    const fd = new FormData()
    fd.append('file', file as unknown as Blob)
    return call<{ receipt: string }>('POST', `/transactions/${id}/receipt`, fd, 60_000)
  },
  deleteReceipt: (id: number) => call<void>('DELETE', `/transactions/${id}/receipt`),
  receiptUrl: (name: string) => `${getServer()}/api/receipts/${encodeURIComponent(name)}`,
  reconcile: (accountId: number, actualCents: number, save = false) =>
    call<Diagnosis>('POST', `/reconcile/${accountId}`, { actual: actualCents / 100, save }),
  reconciliations: () => call<Reconciliation[]>('GET', '/reconciliations'),
  monthEnd: (ym: string) => call<MonthEnd>('GET', `/month-end/${ym}`),
  monthEndTyped: (ym: string, byAccount: Record<number, number>) =>
    call<{ ok: true }>('POST', `/month-end/${ym}/typed`, Object.fromEntries(Object.entries(byAccount).map(([k, v]) => [k, v / 100]))),
  monthEndInterest: (ym: string, byAccount: Record<number, number>) =>
    call<{ ok: true }>('POST', `/month-end/${ym}/interest`, Object.fromEntries(Object.entries(byAccount).map(([k, v]) => [k, v / 100]))),
  // settings-style CRUD (dollar fields converted at the call site)
  orderAccounts: (ids: number[]) => call<{ ok: true }>('PUT', '/accounts/order', { ids }),
  orderCategories: (ids: number[]) => call<{ ok: true }>('PUT', '/categories/order', { ids }),
  saveAccount: (body: object, id?: number) => id ? call<Account>('PUT', `/accounts/${id}`, body) : call<Account>('POST', '/accounts', body),
  deleteAccount: (id: number) => call<void>('DELETE', `/accounts/${id}`),
  saveCategory: (body: object, id?: number) => id ? call<Category>('PUT', `/categories/${id}`, body) : call<Category>('POST', '/categories', body),
  deleteCategory: (id: number) => call<void>('DELETE', `/categories/${id}`),
  setBudget: (categoryId: number, amountCents: number | null, month?: string) =>
    call<{ ok: true }>('PUT', `/budgets/${categoryId}`, { amount: amountCents === null ? null : amountCents / 100, month }),
  saveFavorite: (body: object, id?: number) => id ? call<Favorite>('PUT', `/favorites/${id}`, body) : call<Favorite>('POST', '/favorites', body),
  deleteFavorite: (id: number) => call<void>('DELETE', `/favorites/${id}`),
  orderFavorites: (ids: number[]) => call<{ ok: true }>('PUT', '/favorites/order', { ids }),
  saveRecurring: (body: object, id?: number) => id ? call<Recurring>('PUT', `/recurring/${id}`, body) : call<Recurring>('POST', '/recurring', body),
  deleteRecurring: (id: number) => call<void>('DELETE', `/recurring/${id}`),
  saveView: (body: object, id?: number) => id ? call<SavedView>('PUT', `/saved-views/${id}`, body) : call<SavedView>('POST', '/saved-views', body),
  deleteView: (id: number) => call<void>('DELETE', `/saved-views/${id}`),
  backups: () => call<Backups>('GET', '/backups'),
  putSettings: (body: Record<string, unknown>) => call<Record<string, string>>('PUT', '/settings', body),
}
