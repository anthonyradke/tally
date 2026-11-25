// Typed client for the Tally backend (FastAPI on x1, reached over Tailscale). Amounts are integer cents everywhere in
// the app; request bodies carry dollars because the backend's `cents()` parser is the single source of rounding truth.
import { authHeaders, getServer } from './server'

export type Kind = 'cash' | 'card' | 'investment' | 'loan'
export type CatType = 'Money in' | 'Spending' | 'Saving' | 'Transfer' | 'Loan'
export type Freq = 'weekly' | 'biweekly' | 'monthly' | 'yearly'

/** `opened` is the first month ("2026-10-01") of a loan or investment that began after Tally started counting; it's
 *  zero in the months before. */
export interface Account { id: number; name: string; kind: Kind; bank: string | null; start_balance: number; apy: number | null; loan_rate: number | null; ef: boolean; color: string | null; icon: string | null; active: boolean; opened: string | null }
/** `active: false` = hidden in Settings: kept for existing entries and totals, left out of pickers. */
export interface Category { id: number; name: string; type: CatType; icon: string | null; color: string | null; budget: number | null; active: boolean }
export interface Txn { id: number; date: string; what: string; category_id: number; from_id: number | null; to_id: number | null; amount: number; note: string; tags: string[]; split_group: string | null; receipt: string | null; recurring_id: number | null }
export interface TxnInput { date: string; what: string; category_id: number; from_id: number | null; to_id: number | null; amount: number; note?: string; tags?: string[]; split_group?: string | null }
export interface Favorite { id: number; label: string; category_id: number; from_account_id: number | null; to_account_id: number | null; amount: number | null; sort: number; icon: string | null; color: string | null }
export interface Budget { category_id: number; month: string; amount: number }
/** `anchor_day` is the day a monthly/yearly template aims for (the 31st stays the 31st after February). */
export interface Recurring { id: number; label: string; category_id: number; from_account_id: number | null; to_account_id: number | null; amount: number; what: string; freq: Freq; next_date: string; horizon_days: number; active: number; anchor_day: number | null; created_at: string }
export interface SavedView { id: number; name: string; query: string; icon: string | null; sort: number }
export interface MonthRow { month: string; money_in: number; spent: number; loan: number; saving: number; left_over: number; by_category: Record<string, number>; balances: Record<string, number>; cash: number; invested: number; cards: number; loans: number; net_worth: number }
/** A tag in use and how many entries carry it. */
export interface TagCount { tag: string; count: number }
/** `tags`: most used first. Missing from a bootstrap kept on the phone from before the server sent it. */
export interface Bootstrap { today: string; start: string; accounts: Account[]; categories: Category[]; favorites: Favorite[]; budgets: Budget[]; recurring: Recurring[]; saved_views: SavedView[]; tags?: TagCount[]; settings: Record<string, string>; months: MonthRow[]; ef: { goal: number; progress: number }; roth: { ytd: number; limit: number; category_id: number | null } }
export interface BulkBefore { id: number; category_id: number; tags: string[]; from_id?: number | null; to_id?: number | null }
/** `exact`: how many of the first rows have the very amount a search typed (they come first). */
export interface TxnPage { total: number; sum: number; by_type: Partial<Record<CatType, number>>; exact: number; items: Txn[] }
export interface TxnQuery { q?: string; category?: number; account?: number; type?: CatType | ''; start?: string; end?: string; amount_min?: number; amount_max?: number; tag?: string; group?: string; sort?: 'date' | 'amount'; dir?: 'asc' | 'desc'; limit?: number; offset?: number }
/** `id`: the reconciliation saved (with `save`), for Undo. */
export interface Diagnosis { expected: number; actual: number; gap: number; saved: boolean; id: number | null; doubled: Txn[]; single: Txn[]; future: Txn[] }
/** `loans`: each loan's balance for the month as Tally works it out, and the statement balance typed over it, if any. */
export interface MonthEnd { month: string; typed: Record<string, number | null>; loans: Record<string, { typed: number | null; balance: number }>; recon: Record<string, { actual: number; expected: number; date: string } | null>; interest: Record<string, { logged: Txn[]; proposed: number }>; typed_done: boolean; interest_done: boolean; recon_done: boolean }
export interface Reconciliation { id: number; account_id: number; date: string; actual: number; expected: number }
export interface Backups { latest: { name: string; size: number; at: string } | null; count: number; folder: string }
/** `offsite`: the last good off-site backup (cellar), when the server has one. */
export interface Health { version: string; database: 'ok' | 'damaged'; backups: Backups; offsite: { last_success: string | null; result: string | null } | null }
/** An entry in Recently deleted (kept 30 days); `deleted_at` is UTC; `batch` is shared by the rows one delete removed
 *  (null for older ones). */
/** `skipped_from`: the recurring template's label when this was a scheduled date taken out before its day, which
 *  the template now skips (putting it back posts it again). */
export type DeletedTxn = Txn & { deleted_at: string; batch?: number | null; skipped_from?: string | null }
export interface Skip { recurring_id: number; date: string }
/** A bank statement line: `amount` in cents, signed as the bank's file had it. */
export interface StatementLine { line: number; date: string; what: string; amount: number }
export interface StatementMatch { account_id: number; first: string; last: string; matched: { statement: StatementLine; entry: Txn }[]; missing: StatementLine[]; extra: Txn[] }
/** Settings rows straight from the tables: `active` and `ef` are SQLite's 0/1 here. Saving one returns the same. */
export type AdminAccount = Omit<Account, 'active' | 'ef'> & { sort: number; active: number; ef: number }
export type AdminCategory = Omit<Category, 'active'> & { sort: number; active: number }
/** `next_due`: the next date that will happen (its first row still ahead); `next_slot`: the date that row was posted
 *  for (it differs once the row is moved by hand); `next_date` is the one after those. */
export type AdminRecurring = Recurring & { next_due?: string; next_slot?: string }
export interface AdminData { accounts: AdminAccount[]; categories: AdminCategory[]; favorites: Favorite[]; recurring: AdminRecurring[]; saved_views: SavedView[]; budgets: Budget[]; skips: Skip[]; settings: Record<string, string> }

/** Bank sync (Tally Lab, app/api_bank.py). Amounts in cents; a bank row's `amount` is signed the way Plaid signs it:
 *  positive is money leaving the account (a purchase, a charge on a card), negative is money arriving. */
export interface BankAccount { id: number; name: string; official_name: string | null; mask: string | null; type: string | null; subtype: string | null; tally_account_id: number | null; current: number | null; available: number | null; balance_at: string | null }
export interface BankItem { id: number; institution: string | null; error: string | null; synced_at: string | null; created_at: string; accounts: BankAccount[] }
/** An everyday bank account (checking, savings, a card) nobody has said is or isn't one of Tally's; `kinds`: the
 *  Tally account kinds it could be. */
export interface BankAsk { id: number; name: string; mask: string | null; institution: string | null; kinds: Kind[] }
/** `waiting`: posted bank rows on connected accounts that no entry stands for yet. */
export interface BankStatus { env: 'sandbox' | 'production'; items: BankItem[]; waiting: number; ask: BankAsk[]; auto?: boolean }
export type Confidence = 'sure' | 'likely' | 'guess' | 'unknown'
/** Tally's best guess at the entry a bank row stands for, shaped like an entry (`amount` signed as the entry). */
export interface BankGuess { what: string; category_id: number | null; from_id: number | null; to_id: number | null; amount: number; confidence: Confidence; source: 'history' | 'transfer' | 'plaid' | 'none'; why: string; pair_id: number | null }
/** `account_id`: the Tally account it's on. Pending rows come without a guess: the bank can still change them. */
export interface BankRow { id: number; date: string; authorized_date: string | null; raw: string; merchant: string | null; logo: string | null; amount: number; pending: boolean; account_id: number; bank_account: string; guess: BankGuess | null }
export interface BankAccept { what?: string; category_id?: number; from_id?: number | null; to_id?: number | null; amount?: number; date?: string; note?: string }
export interface BankAudit { account_id: number; bank_account: string; first: string; bank_balance: number | null; tally_balance: number | null; gap: number | null; pending: number; balance_at: string | null; matched: number; missing: { id: number; date: string; raw: string; merchant: string | null; amount: number }[]; extra: { id: number; date: string; what: string; amount: number }[] }
/** `added`: entries Tally added by itself (a ledger set up from the banks). */
export interface BankSynced { synced: Record<string, { added?: number; modified?: number; removed?: number; error?: string; message?: string }>; paired: number; added?: number }
/** A row Tally added by itself lately (a ledger set up from the banks), with the entry it became. */
export interface BankRecent { id: number; txn_id: number; date: string; what: string; category_id: number; amount: number; raw: string; account_id: number | null }
/** First-time setup from the banks (app/api_setup.py): each connected bank account as setup would make it. */
export interface SetupAccount { id: number; name: string; mask: string | null; type: string | null; subtype: string | null; kind: Kind | null; suggested: string; include: boolean; current: number | null; rows: number; first: string | null }
export interface SetupItem { id: number; institution: string | null; brand: string; color: string | null; logo: boolean; accounts: SetupAccount[] }
export interface SetupStatus { needed: boolean; env: 'sandbox' | 'production'; items: SetupItem[] }
export interface SetupDone { accounts: { id: number; name: string; kind: Kind }[]; start: string; added: number; waiting: number }
/** A new connection: the accounts Tally matched to its own by name. */
/** `items`: every bank the session added (one Plaid Link session can add several); `item_id` is the first. */
export type BankConnected = BankSynced & { item_id: number | null; items: number[]; matched: { bank_account: string; account_id: number }[] }

export interface CardFace { art: string | null; mask: string | null; subtype: string | null; institution: string | null; color: string | null }

export class ApiError extends Error {
  constructor(public status: number, public errors: string[]) { super(errors.join(' ')) }
}

/** True when the request never got an answer from Tally (no signal, Tailscale off, timed out, server restarting),
 *  as opposed to Tally refusing it. Only these are worth retrying. */
export const unreachable = (e: unknown) =>
  e instanceof ApiError ? e.status >= 502 : e instanceof TypeError || (e instanceof Error && e.name === 'AbortError')

/** Tally refused the token (401) or the tailnet login (403): nothing wrong with the entry, so it waits, like when
 *  offline, until the token in Settings is right. */
export const locked = (e: unknown) => e instanceof ApiError && (e.status === 401 || e.status === 403)

async function call<T>(method: string, path: string, body?: unknown, timeoutMs = 15_000): Promise<T> {
  const isForm = body instanceof FormData
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${getServer()}/api${path}`, {
      method, signal: ctrl.signal,
      headers: body === undefined || isForm ? authHeaders() : { ...authHeaders(), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
    if (res.status === 204) return undefined as T
    const data = await res.json().catch(() => undefined)
    // Anything that isn't Tally's JSON (a dev server's HTML page, a captive portal, a proxy's 403 or 404 page) counts
    // as unreachable, whatever its status: it isn't Tally refusing the request. A plain 500 is Tally's own crash page.
    if (data === undefined && res.status !== 500) throw new ApiError(502, ['Tally did not answer at this address.'])
    if (res.status === 401) throw new ApiError(401, ['Tally wants its token. Add it in Settings, Server.'])
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
  transaction: (id: number) => call<Txn>('GET', `/transactions/${id}`),
  /** `clientId` makes the create safe to retry: the server returns the row it already wrote for that id. */
  createTxn: (t: TxnInput, clientId?: string) => call<Txn>('POST', '/transactions', { ...dollars(t), client_id: clientId }, 12_000),
  createSplit: (lines: TxnInput[], clientId?: string) => call<Txn[]>('POST', '/transactions/split', { lines: lines.map(dollars), client_id: clientId }, 12_000),
  updateTxn: (id: number, t: TxnInput) => call<Txn>('PUT', `/transactions/${id}`, dollars(t)),
  /** Returns the row as it was, for Undo via `restore`. */
  deleteTxn: (id: number) => call<Txn>('DELETE', `/transactions/${id}`),
  /** Undo for deletes: puts rows back exactly (same id, receipt, split and recurring links). */
  restore: (rows: Txn[]) => call<Txn[]>('POST', '/transactions/restore', { rows: rows.map((t) => ({ ...t, amount: t.amount / 100 })) }),
  /** `before`: each row's category and tags (and accounts, after an account change) as they were, for Undo via `revert`. */
  bulk: (body: { ids: number[]; action: 'delete' | 'recategorize' | 'tag' | 'account'; category_id?: number; tags?: string[]; account_id?: number; side?: 'from' | 'to' | 'each' }) =>
    call<{ ok: true; count: number; deleted?: Txn[]; before?: BulkBefore[] }>('POST', '/transactions/bulk', body),
  revert: (rows: BulkBefore[]) => call<{ ok: true; count: number }>('POST', '/transactions/bulk', { action: 'revert', rows }),
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
  deleteReconciliation: (id: number) => call<void>('DELETE', `/reconciliations/${id}`),
  monthEnd: (ym: string) => call<MonthEnd>('GET', `/month-end/${ym}`),
  /** `cleared`: accounts whose typed balance comes back out (a loan goes back to working itself out). */
  monthEndTyped: (ym: string, byAccount: Record<number, number>, cleared: number[] = []) =>
    call<{ ok: true }>('POST', `/month-end/${ym}/typed`, { ...Object.fromEntries(cleared.map((k) => [k, null])), ...Object.fromEntries(Object.entries(byAccount).map(([k, v]) => [k, v / 100])) }),
  monthEndInterest: (ym: string, byAccount: Record<number, number>) =>
    call<{ ok: true }>('POST', `/month-end/${ym}/interest`, Object.fromEntries(Object.entries(byAccount).map(([k, v]) => [k, v / 100]))),
  // settings-style CRUD (dollar fields converted at the call site)
  orderAccounts: (ids: number[]) => call<{ ok: true }>('PUT', '/accounts/order', { ids }),
  orderCategories: (ids: number[]) => call<{ ok: true }>('PUT', '/categories/order', { ids }),
  saveAccount: (body: object, id?: number) => id ? call<AdminAccount>('PUT', `/accounts/${id}`, body) : call<AdminAccount>('POST', '/accounts', body),
  deleteAccount: (id: number) => call<void>('DELETE', `/accounts/${id}`),
  saveCategory: (body: object, id?: number) => id ? call<AdminCategory>('PUT', `/categories/${id}`, body) : call<AdminCategory>('POST', '/categories', body),
  deleteCategory: (id: number) => call<void>('DELETE', `/categories/${id}`),
  setBudget: (categoryId: number, amountCents: number | null, month?: string) =>
    call<{ ok: true }>('PUT', `/budgets/${categoryId}`, { amount: amountCents === null ? null : amountCents / 100, month }),
  saveFavorite: (body: object, id?: number) => id ? call<Favorite>('PUT', `/favorites/${id}`, body) : call<Favorite>('POST', '/favorites', body),
  deleteFavorite: (id: number) => call<void>('DELETE', `/favorites/${id}`),
  orderFavorites: (ids: number[]) => call<{ ok: true }>('PUT', '/favorites/order', { ids }),
  /** `move: true` moves its schedule to `next_date`, `move: false` keeps it (see app/api_recurring.py). */
  saveRecurring: (body: object, id?: number) => id ? call<AdminRecurring>('PUT', `/recurring/${id}`, body) : call<AdminRecurring>('POST', '/recurring', body),
  /** Returns the template and the future rows that went with it, for Undo: `restoreRecurring`, then `restore`.
   *  Nothing (204) when it was already gone. */
  deleteRecurring: (id: number) => call<{ template: Recurring; rows: Txn[] } | undefined>('DELETE', `/recurring/${id}`),
  restoreRecurring: (template: Recurring) => call<Recurring>('POST', '/recurring/restore', { template }),
  saveView: (body: object, id?: number) => id ? call<SavedView>('PUT', `/saved-views/${id}`, body) : call<SavedView>('POST', '/saved-views', body),
  deleteView: (id: number) => call<void>('DELETE', `/saved-views/${id}`),
  orderViews: (ids: number[]) => call<{ ok: true }>('PUT', '/saved-views/order', { ids }),
  backups: () => call<Backups>('GET', '/backups'),
  health: () => call<Health>('GET', '/health'),
  /** Newest first. Putting one back is `restore` with the row (which also takes it off the list). */
  deleted: () => call<DeletedTxn[]>('GET', '/deleted'),
  forgetDeleted: (id: number) => call<void>('DELETE', `/deleted/${id}`),
  emptyDeleted: () => call<void>('DELETE', '/deleted'),
  /** Skips one date (the next when left out). Undo: `restore` the rows, or `unskipRecurring` when none had posted. */
  skipRecurring: (id: number, date?: string) => call<{ date: string; rows: Txn[] }>('POST', `/recurring/${id}/skip`, date ? { date } : {}),
  unskipRecurring: (id: number, date: string) => call<void>('DELETE', `/recurring/${id}/skip/${date}`),
  statement: (accountId: number, csv: string) => call<StatementMatch>('POST', `/reconcile/${accountId}/statement`, { csv }, 30_000),
  putSettings: (body: Record<string, unknown>) => call<Record<string, string>>('PUT', '/settings', body),
  setup: {
    /** 404 on a server without bank sync. */
    status: () => call<SetupStatus>('GET', '/setup'),
    finish: (body: { history: 'all' | 'month'; accounts: { id: number; name?: string; include: boolean }[] }) =>
      call<SetupDone>('POST', '/setup', body, 240_000),
  },
  /** An entry's logo by its name, an account's bank logo, or a connected bank's (`item`). 404 when there's none:
   *  show a symbol instead. */
  /** `tag`: what the account or bank is called, added to the address so an image cached for an earlier account or bank
   *  with the same number (a ledger set up again) is never shown for this one. */
  logoUrl: (q: { name?: string; account?: number; item?: number; tag?: string }) =>
    `${getServer()}/api/logo${q.item !== undefined ? `?item=${q.item}` : q.account !== undefined ? `?account=${q.account}` : `?name=${encodeURIComponent(q.name ?? '')}`}${q.tag && (q.item !== undefined || q.account !== undefined) ? `&t=${encodeURIComponent(q.tag)}` : ''}`,
  /** A brand's color (#RRGGBB) from Plaid or from its logo; null when there isn't one. */
  logoColor: (q: { name?: string; account?: number; item?: number }) =>
    call<{ color: string | null }>('GET', `/logo/color${q.item !== undefined ? `?item=${q.item}` : q.account !== undefined ? `?account=${q.account}` : `?name=${encodeURIComponent(q.name ?? '')}`}`),
  /** Each account's card face: a picture of the real card if one was added, and from its bank the last four digits,
   *  the bank's name and its color. */
  cards: () => call<Record<string, CardFace>>('GET', '/cards'),
  uploadArt: (id: number, file: { uri: string; name: string; type: string }) => {
    const fd = new FormData()
    fd.append('file', file as unknown as Blob)
    return call<{ art: string }>('PUT', `/accounts/${id}/art`, fd, 60_000)
  },
  deleteArt: (id: number) => call<void>('DELETE', `/accounts/${id}/art`),
  hideLogo: (name: string) => call<void>('DELETE', `/logo?name=${encodeURIComponent(name)}`),
  showLogo: (name: string) => call<void>('POST', `/logo/show?name=${encodeURIComponent(name)}`),
  bank: {
    /** 404 when the server has no Plaid keys (the real Tally, for now): bank sync is off there. */
    status: () => call<BankStatus>('GET', '/bank'),
    inbox: () => call<BankRow[]>('GET', '/bank/inbox', undefined, 30_000),
    /** `maxAge` (seconds): the server skips the banks when it checked them all more recently than that. */
    sync: (maxAge?: number) => call<BankSynced>('POST', maxAge === undefined ? '/bank/sync' : `/bank/sync?max_age=${maxAge}`, undefined, 90_000),
    linkToken: (itemId?: number) => call<{ link_token: string; multi?: boolean }>('POST', '/bank/link-token', itemId ? { item_id: itemId } : {}),
    /** One bank by its public token, or every bank a multi-bank session added, by the session's link token. */
    connect: (by: { public_token: string } | { link_token: string }) => call<BankConnected>('POST', '/bank/connect', by, 180_000),
    sandbox: () => call<BankConnected>('POST', '/bank/sandbox/connect', undefined, 120_000),
    disconnect: (itemId: number) => call<void>('DELETE', `/bank/items/${itemId}`),
    mapAccount: (bankAccountId: number, tallyAccountId: number | null) => call<{ paired: number }>('PUT', `/bank/accounts/${bankAccountId}`, { tally_account_id: tallyAccountId }),
    /** Adds the entry a bank row stands for: the guess, with anything in `over` instead (`amount` in cents here). */
    accept: (id: number, over: BankAccept = {}) => call<Txn>('POST', `/bank/inbox/${id}/accept`, over.amount === undefined ? over : { ...over, amount: over.amount / 100 }),
    /** Adds each row as Tally guessed it; ones without a category are skipped. */
    acceptMany: (ids: number[]) => call<Txn[]>('POST', '/bank/inbox/accept', { ids }, 60_000),
    acceptSure: () => call<Txn[]>('POST', '/bank/inbox/accept-sure', undefined, 60_000),
    pair: (id: number, txnId: number) => call<{ ok: true }>('POST', `/bank/inbox/${id}/pair`, { txn_id: txnId }),
    ignore: (id: number) => call<{ ok: true }>('POST', `/bank/inbox/${id}/ignore`),
    reset: (id: number) => call<{ ok: true }>('POST', `/bank/txns/${id}/reset`),
    recent: (days = 7) => call<BankRecent[]>('GET', `/bank/recent?days=${days}`),
    audit: (bankAccountId: number) => call<BankAudit>('GET', `/bank/audit/${bankAccountId}`, undefined, 30_000),
  },
}

/** A file from the server as text (the CSV exports), with the token: opening the URL in Safari sent none. */
export async function download(path: string): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000)
  try {
    const res = await fetch(`${getServer()}${path}`, { headers: authHeaders(), signal: ctrl.signal })
    if (res.status === 401) throw new ApiError(401, ['Tally wants its token. Add it in Settings, Server.'])
    if (!res.ok) throw new ApiError(res.status >= 500 ? 502 : res.status, [`Export failed (${res.status}).`])
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/** Checks an address and token before Settings switches to them, so nothing (the outbox, a refetch) goes to an
 *  address that doesn't work in the meantime. Resolves with the server's version. */
export async function probe(url: string, token: string): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(`${url}/api/health`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: ctrl.signal })
    const data = await res.json().catch(() => undefined)
    if (data === undefined) throw new ApiError(502, ['Tally did not answer at this address.'])
    if (res.status === 401) throw new ApiError(401, ['Tally answered, but refused the token.'])
    if (res.status === 404) throw new ApiError(404, ['Tally answered, but needs updating on the server.'])
    if (!res.ok) throw new ApiError(res.status, [`Tally answered with an error (${res.status}).`])
    return (data as Health).version
  } finally {
    clearTimeout(timer)
  }
}
