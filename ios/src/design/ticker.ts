// The arithmetic behind the ticker on Accounts, kept apart from the view so it can be tested: a short symbol for each
// account (as a market ticker would print it), the month's move and whether it's good news, how that reads, and the
// worklets the strip runs on the UI thread (where the loop wraps, which item a tap lands on).
import type { Account, MonthRow } from '@/lib/api'
import { formatCents, formatChange } from '@/lib/money'
import { bankName } from './look'

/** The symbol net worth goes by; no account gets it. */
export const NET = 'NET'

// A product word names the account better than its bank ("Schwab Roth" is ROTH), so it comes first.
const PRODUCT: [RegExp, string][] = [
  [/\broth\b/i, 'ROTH'], [/\b401\s*\(?k\)?/i, '401K'], [/\b403\s*\(?b\)?/i, '403B'], [/\b529\b/, '529'],
  [/\bhsa\b/i, 'HSA'], [/\bfsa\b/i, 'FSA'], [/\bira\b/i, 'IRA'], [/\btesla\b/i, 'TSLA'],
  [/\b(auto|car|vehicle)\b/i, 'AUTO'], [/\bstudent\b/i, 'STU'], [/\bmortgage\b/i, 'MTG'], [/\bheloc\b/i, 'HELOC'],
  [/\bemergency\b/i, 'EMRG'],
]
// A plain word says less than the bank ("Chase Checking" is CHASE), so it's used when there's no bank, or after it.
const PLAIN: [RegExp, string][] = [
  [/\bchecking\b/i, 'CHK'], [/\b(high[-\s]?yield|hysa)\b/i, 'HYSA'], [/\bsavings?\b/i, 'SAV'], [/\bmoney\b/i, 'MNY'],
  [/\bcash\b/i, 'CASH'], [/\bbrokerage\b/i, 'BRKG'], [/\binvest(ment|ments|ing)?\b/i, 'INV'],
  [/\bcredit\b|\bcards?\b/i, 'CARD'], [/\bloans?\b/i, 'LOAN'],
]
const BRANDS: [RegExp, string][] = [
  [/\b(amex|american express)\b/i, 'AMEX'], [/\bchase\b/i, 'CHASE'], [/\bsofi\b/i, 'SOFI'],
  [/\bwells( fargo)?\b/i, 'WELLS'], [/\b(charles )?schwab\b/i, 'SCHW'], [/\bempower\b/i, 'EMPWR'],
  [/\bmohela\b/i, 'MOHELA'], [/\bfidelity\b/i, 'FID'], [/\bvanguard\b/i, 'VANG'], [/\brobinhood\b/i, 'HOOD'],
  [/\bcapital ?one\b/i, 'CAP1'], [/\bdiscover\b/i, 'DISC'], [/\bciti(bank)?\b/i, 'CITI'],
  [/\b(bank of america|bofa)\b/i, 'BOFA'], [/\bapple\b/i, 'AAPL'], [/\bpaypal\b/i, 'PYPL'], [/\bvenmo\b/i, 'VENMO'],
  [/\bally\b/i, 'ALLY'], [/\bmarcus\b/i, 'MRCS'],
]
const STOP = /\b(the|of|and|my|a|an|account|acct|bank|fund|card|fargo|express)\b/gi

const first = (table: [RegExp, string][], text: string) => table.find(([re]) => re.test(text))?.[1] ?? null

/** A word or a name cut down the way tickers are: a short word whole, a long one to four letters, three or more
 *  words to their initials. Null when nothing distinctive is left. */
function abbreviate(text: string): string | null {
  const words = text.split(/[^A-Za-z0-9]+/).filter(Boolean)
  if (!words.length) return null
  if (words.length >= 3) return words.map((w) => w[0]).join('').slice(0, 4).toUpperCase()
  const w = words[0].toUpperCase()
  return w.length <= 5 ? w : w.slice(0, 4)
}

/** The bank's symbol from the bank field (any brand, even one letter like X) or from a brand in the name. */
function brandOf(a: Pick<Account, 'bank' | 'name'>): string | null {
  const bank = a.bank?.trim()
  if (bank) return first(BRANDS, bank) ?? (/^x$/i.test(bank) ? 'X' : abbreviate(bank.replace(STOP, ' ')))
  return first(BRANDS, a.name)
}

/** What's left of a name once its brand and plain words are taken out ("Blue Cash" → BLUE). */
function distinctive(name: string): string | null {
  let rest = name
  for (const [re] of [...BRANDS, ...PLAIN]) rest = rest.replace(new RegExp(re.source, 'gi'), ' ')
  return abbreviate(rest.replace(STOP, ' '))
}

/** The symbols an account could go by, best first. */
export function candidates(a: Pick<Account, 'name' | 'bank' | 'kind'>): string[] {
  const product = first(PRODUCT, a.name)
  const brand = brandOf(a)
  const plain = first(PLAIN, a.name)
  const own = distinctive(a.name)
  const kind = { cash: 'CASH', card: 'CARD', investment: 'INV', loan: 'LOAN' }[a.kind]
  // A one- or two-letter brand (X) is too thin alone: it takes the account's word after it (X Money → XMNY).
  const branded = brand && brand.length < 3 ? (brand + (plain ?? own ?? kind)).slice(0, 5) : brand
  const out = [product, branded, plain, own, kind].filter((s): s is string => !!s && s !== NET)
  return [...new Set(out)]
}

/** A symbol for every account, unique among them: when two would share one, both move to their next choice (Chase
 *  Checking and Chase Freedom become CHK and FREE), and a tie nothing settles gets a number (CHK, CHK2). */
export function tickerSymbols(all: Pick<Account, 'id' | 'name' | 'bank' | 'kind'>[]): Map<number, string> {
  const options = all.map(candidates)
  const wanted = new Map<string, number>()
  for (const o of options) wanted.set(o[0], (wanted.get(o[0]) ?? 0) + 1)
  const used = new Set<string>([NET])
  const out = new Map<number, string>()
  all.forEach((a, i) => { const s = options[i][0]; if (wanted.get(s) === 1) { out.set(a.id, s); used.add(s) } })
  all.forEach((a, i) => {
    if (out.has(a.id)) return
    const next = options[i].slice(1).find((s) => !used.has(s) && !wanted.has(s))
    let s = next
    if (!s) {
      const base = (options[i][1] ?? options[i][0]).slice(0, 5)
      s = base
      for (let n = 2; used.has(s); n++) s = `${base}${n}`
    }
    out.set(a.id, s)
    used.add(s)
  })
  return out
}

/** One account's symbol among all of them (see `tickerSymbols`). */
export function tickerSymbol(a: Pick<Account, 'id' | 'name' | 'bank' | 'kind'>, all: Pick<Account, 'id' | 'name' | 'bank' | 'kind'>[]): string {
  const list = all.some((x) => x.id === a.id) ? all : [...all, a]
  return tickerSymbols(list).get(a.id) ?? candidates(a)[0]
}

export type Mood = 'good' | 'bad' | 'flat'
/** One entry on the strip. `id` is null for net worth. `pct` is against last month's size, null when it was 0 or there
 *  was no last month. `mood`: whether the move is good news; cards and loans are owed, so their balance going up isn't. */
export interface TickerItem { key: string; id: number | null; symbol: string; name: string; balance: number; change: number; pct: number | null; mood: Mood }

const owed = (a: Pick<Account, 'kind'>) => a.kind === 'card' || a.kind === 'loan'
const moodOf = (change: number, isOwed: boolean): Mood => (change === 0 ? 'flat' : (change > 0) !== isOwed ? 'good' : 'bad')
const pctOf = (change: number, before: number | undefined) => (before ? (change / Math.abs(before)) * 100 : null)

/** How an account is said aloud: its bank before its name when the name doesn't already carry it ("Chase Checking"). */
export function spokenName(a: Pick<Account, 'bank' | 'name'>): string {
  const bank = bankName(a)
  return bank && !a.name.toLowerCase().includes(bank.toLowerCase()) ? `${bank} ${a.name}` : a.name
}

/** Net worth, then each account in `shown` (the screen's order). `now` holds this month's balances; `before` last
 *  month's end, or nothing when this month's row isn't there yet (then nothing has moved). */
export function tickerItems(shown: Account[], all: Account[], now: MonthRow | undefined, before: MonthRow | undefined): TickerItem[] {
  if (!now) return []
  const symbols = tickerSymbols(all)
  const net = before ? now.net_worth - before.net_worth : 0
  const items: TickerItem[] = [{ key: 'net', id: null, symbol: NET, name: 'Net worth', balance: now.net_worth, change: net,
    pct: before ? pctOf(net, before.net_worth) : null, mood: moodOf(net, false) }]
  for (const a of shown) {
    const balance = now.balances[a.id] ?? 0
    const last = before ? before.balances[a.id] ?? 0 : balance
    const change = balance - last
    items.push({ key: String(a.id), id: a.id, symbol: symbols.get(a.id) ?? candidates(a)[0], name: spokenName(a), balance,
      change, pct: before ? pctOf(change, last) : null, mood: moodOf(change, owed(a)) })
  }
  return items
}

/** The move as the strip prints it: "▲ $120", "▼ $40", or "—" when nothing moved. */
export const moveText = (change: number) => (change === 0 ? '—' : `${change > 0 ? '▲' : '▼'} ${formatChange(Math.abs(change))}`)

/** The percent beside it, unsigned (the arrow says which way): one decimal under 100, whole above. Left off past
 *  999%: a card that went from $10 to $190 says more in dollars. */
export function pctText(pct: number | null): string | null {
  if (pct === null || !Number.isFinite(pct) || pct === 0) return null
  const p = Math.abs(pct)
  if (p < 0.1) return '<0.1%'
  if (p >= 1000) return null
  return `${p < 100 ? p.toFixed(1) : Math.round(p)}%`
}

export const balanceText = (cents: number) => formatCents(cents, { cents: false })

/** What VoiceOver reads for one item: "Chase Checking, $8,358, up $120 this month". */
export function itemLabel(t: TickerItem): string {
  const move = t.change === 0 ? 'no change this month' : `${t.change > 0 ? 'up' : 'down'} ${formatChange(Math.abs(t.change))} this month`
  return `${t.name}, ${balanceText(t.balance)}, ${move}`
}

/** What VoiceOver reads for the whole strip. */
export const stripLabel = (items: TickerItem[]) =>
  `Ticker: ${items.map((t) => `${t.name} ${t.change === 0 ? 'unchanged' : `${t.change > 0 ? 'up' : 'down'} ${formatChange(Math.abs(t.change))}`}`).join('; ')}`

/** The strip's pace and feel. Points per second, the pause after a touch, the ramp back up, and how fast a fling slows. */
export const TICKER_SPEED = 30
export const RESUME_DELAY_MS = 1400
export const RESUME_RAMP_MS = 900
export const FLING_FRICTION = 3.5
export const FLING_MAX = 2400

/** An offset folded back into one run's width, (−w, 0], so the loop never shows a seam. */
export function wrap(x: number, w: number): number {
  'worklet'
  if (w <= 0) return 0
  const r = x % w
  return r > 0 ? r - w : r
}

/** Which item a point on the strip falls on: `x` from the strip's left edge, `offset` where the run stands, `starts`
 *  each item's left edge within the run. */
export function itemAt(x: number, offset: number, starts: readonly number[], w: number): number {
  'worklet'
  if (w <= 0 || !starts.length) return -1
  const local = (((x - offset) % w) + w) % w
  let i = 0
  for (let j = 0; j < starts.length; j++) if (starts[j] <= local) i = j
  return i
}

/** How many copies of the run fill a strip `band` wide and leave one to slide in. */
export const copiesFor = (band: number, w: number) => (w > 0 ? Math.max(2, Math.ceil(band / w) + 1) : 1)

/** Milliseconds now, from a gesture's worklet (when the finger last moved). */
export function clock(): number {
  'worklet'
  return Date.now()
}
