// Contract check: fetch every endpoint of a running backend (a seeded demo database, never the real one) and
// validate each answer against the TypeScript shapes in src/lib/api.ts, read with the TypeScript compiler. Then
// check that the app's own math (balances by day, month buckets, money formatting, From/To rules) agrees with the
// server's for the same data.
//
//   node --no-warnings --import ./test/register.mjs test/contract.ts http://127.0.0.1:8001 [facts.json]
//
// Run by tests/test_contract.py, which seeds the database, starts the server and writes facts.json from the engine.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import type { Account, Bootstrap, CatType, Txn, TxnPage } from '@/lib/api'
import { dailyBalances } from '@/lib/balances'
import { monthOf } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { fits } from '@/lib/shapes'
import { groupByDay } from '@/lib/txn'

const base = process.argv[2]
const facts = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : null
const errors: string[] = []
const notes = new Set<string>()

// ---------- shapes from api.ts ----------
const shapesFile = fileURLToPath(new URL('./contract-shapes.ts', import.meta.url))
const program = ts.createProgram([shapesFile], {
  strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, baseUrl: fileURLToPath(new URL('..', import.meta.url)), paths: { '@/*': ['./src/*'] },
})
const checker = program.getTypeChecker()
const shapesSym = checker.getSymbolAtLocation(program.getSourceFile(shapesFile)!)!
const shapesType = checker.getDeclaredTypeOfSymbol(checker.getExportsOfModule(shapesSym).find((s) => s.name === 'Shapes')!)
const shape = (name: string) => checker.getTypeOfSymbol(shapesType.getProperty(name)!)

const DATE = /^\d{4}-\d{2}-\d{2}$/
const DATE_KEYS = new Set(['date', 'month', 'today', 'start', 'next_date'])

function check(value: unknown, type: ts.Type, path: string, out: string[]): void {
  const f = type.flags
  if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return
  if (type.isUnion()) {
    const tries = type.types.map((t) => { const e: string[] = []; check(value, t, path, e); return e })
    if (!tries.some((e) => e.length === 0)) out.push(`${path}: ${JSON.stringify(value)?.slice(0, 60)} is not ${checker.typeToString(type)}`)
    return
  }
  if (f & ts.TypeFlags.Null) { if (value !== null) out.push(`${path}: expected null`); return }
  if (f & ts.TypeFlags.Undefined) { if (value !== undefined) out.push(`${path}: expected undefined`); return }
  if (f & ts.TypeFlags.StringLiteral) { if (value !== (type as ts.StringLiteralType).value) out.push(`${path}: ${JSON.stringify(value)} is not "${(type as ts.StringLiteralType).value}"`); return }
  if (f & ts.TypeFlags.NumberLiteral) { if (value !== (type as ts.NumberLiteralType).value) out.push(`${path}: ${value} is not ${(type as ts.NumberLiteralType).value}`); return }
  if (f & ts.TypeFlags.BooleanLiteral) { if (value !== (checker.typeToString(type) === 'true')) out.push(`${path}: ${JSON.stringify(value)} is not ${checker.typeToString(type)}`); return }
  if (f & ts.TypeFlags.String) {
    if (typeof value !== 'string') out.push(`${path}: ${JSON.stringify(value)?.slice(0, 40)} is not a string`)
    else if (DATE_KEYS.has(path.split('.').at(-1)!) && !DATE.test(value)) out.push(`${path}: "${value}" is not YYYY-MM-DD`)
    return
  }
  if (f & ts.TypeFlags.Number) {
    if (typeof value !== 'number' || !Number.isFinite(value)) out.push(`${path}: ${JSON.stringify(value)} is not a number`)
    return
  }
  if (f & ts.TypeFlags.Boolean) { if (typeof value !== 'boolean') out.push(`${path}: ${JSON.stringify(value)} is not a boolean`); return }
  if (checker.isArrayType(type)) {
    if (!Array.isArray(value)) { out.push(`${path}: expected an array`); return }
    const item = checker.getTypeArguments(type as ts.TypeReference)[0]
    value.forEach((v, i) => check(v, item, `${path}[${i}]`, out))
    return
  }
  if (f & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) { out.push(`${path}: expected an object, got ${JSON.stringify(value)?.slice(0, 40)}`); return }
    const obj = value as Record<string, unknown>
    const props = checker.getPropertiesOfType(type)
    const declared = new Set(props.map((p) => p.name))
    for (const p of props) {
      const optional = (p.flags & ts.SymbolFlags.Optional) !== 0
      if (!(p.name in obj)) { if (!optional) out.push(`${path}.${p.name}: missing`); continue }
      check(obj[p.name], checker.getTypeOfSymbol(p), `${path}.${p.name}`, out)
    }
    const index = checker.getIndexInfosOfType(type)
    for (const k of Object.keys(obj)) {
      if (declared.has(k)) continue
      if (index.length) check(obj[k], index[0].type, `${path}[${k}]`, out)
      else notes.add(`${path.replace(/\[\d+\]/g, '[]')}.${k}: sent by the server, not in the app's type`)
    }
    if (DATE_KEYS.has(path.split('.').at(-1)!)) out.push(`${path}: a date field holds an object`)
    return
  }
  out.push(`${path}: unhandled type ${checker.typeToString(type)}`)
}

async function hit(name: string, method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(base + path, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  if (res.status >= 400) { errors.push(`${method} ${path}: HTTP ${res.status} ${await res.text()}`); return undefined }
  if (res.status === 204) return undefined
  const data = await res.json()
  const out: string[] = []
  check(data, shape(name), `${method} ${path.split('?')[0]}`, out)
  errors.push(...out.slice(0, 20))
  return data
}

// ---------- every endpoint ----------
const b: Bootstrap = await hit('bootstrap', 'GET', '/api/bootstrap')
await hit('admin', 'GET', '/api/admin')
const all: TxnPage = await hit('page', 'GET', '/api/transactions?limit=10000&sort=date&dir=asc')
await hit('page', 'GET', '/api/transactions?type=Spending&q=co&limit=5')
await hit('reconciliations', 'GET', '/api/reconciliations')
await hit('backups', 'GET', '/api/backups')
for (const m of b.months) await hit('monthEnd', 'GET', `/api/month-end/${m.month.slice(0, 7)}`)
const cash = b.accounts.filter((a) => a.kind === 'cash' || a.kind === 'card')
const expected = new Map<number, number>()
for (const a of cash) expected.set(a.id, (await hit('diagnosis', 'POST', `/api/reconcile/${a.id}`, { actual: 0 })).expected)

const spend = b.categories.find((c) => c.type === 'Spending' && c.active)!
const card = b.accounts.find((a) => a.kind === 'card')!
const input = { date: b.today, what: 'Contract check', category_id: spend.id, from_id: card.id, to_id: null, amount: 12.34, note: '', tags: ['check'] }
const made: Txn = await hit('txn', 'POST', '/api/transactions', { ...input, client_id: 'contract-check-1' })
await hit('txn', 'POST', '/api/transactions', { ...input, client_id: 'contract-check-1' })
await hit('txn', 'PUT', `/api/transactions/${made.id}`, { ...input, amount: 20 })
const split: Txn[] = await hit('txns', 'POST', '/api/transactions/split', { lines: [input, { ...input, amount: 1 }], client_id: 'contract-check-2' })
await hit('bulk', 'POST', '/api/transactions/bulk', { ids: split.map((x) => x.id), action: 'tag', tags: ['x'] })
const gone: Txn = await hit('txn', 'DELETE', `/api/transactions/${made.id}`)
await hit('txns', 'POST', '/api/transactions/restore', { rows: [{ ...gone, amount: gone.amount / 100 }] })
const removed = await hit('bulk', 'POST', '/api/transactions/bulk', { ids: [made.id, ...split.map((x) => x.id)], action: 'delete' })
if (removed?.deleted?.length !== 3) errors.push('bulk delete did not return the three rows it removed')
await hit('account', 'PUT', `/api/accounts/${card.id}`, { name: card.name, kind: card.kind, bank: card.bank, start_balance: card.start_balance / 100, ef: card.ef, active: card.active })
await hit('category', 'PUT', `/api/categories/${spend.id}`, { name: spend.name, type: spend.type, active: true, budget: spend.budget == null ? null : spend.budget / 100 })
const fav = await hit('favorite', 'POST', '/api/favorites', { label: 'Contract', category_id: spend.id, from_account_id: card.id, amount: 3 })
await hit('ok', 'DELETE', `/api/favorites/${fav.id}`)
const view = await hit('view', 'POST', '/api/saved-views', { name: 'Contract', query: 'tag=check' })
await hit('ok', 'DELETE', `/api/saved-views/${view.id}`)
const rec = await hit('recurring', 'POST', '/api/recurring', { label: 'Contract', category_id: spend.id, from_account_id: card.id, amount: 1, freq: 'yearly', next_date: '2099-01-01' })
await hit('ok', 'DELETE', `/api/recurring/${rec.id}`)
await hit('ok', 'PUT', `/api/budgets/${spend.id}`, { amount: spend.budget == null ? null : spend.budget / 100 })
await hit('settings', 'PUT', '/api/settings', { theme: b.settings.theme ?? '' })

// ---------- the app's math against the server's ----------
const rows = all.items
const typeOf = (t: Txn): CatType => b.categories.find((c) => c.id === t.category_id)!.type
const end = (m: string) => { const d = new Date(`${m}T00:00:00`); d.setMonth(d.getMonth() + 1, 0); return `${m.slice(0, 8)}${String(d.getDate()).padStart(2, '0')}` }
for (const m of b.months) {
  for (const a of cash) {
    const mine = dailyBalances(a as Account, rows, b.start, end(m.month)).values.at(-1)
    if (mine !== m.balances[String(a.id)]) errors.push(`${a.name} at the end of ${m.month}: app ${mine}, server ${m.balances[String(a.id)]}`)
  }
  const inMonth = rows.filter((t) => monthOf(t.date) === m.month)
  const spent = inMonth.filter((t) => typeOf(t) === 'Spending').reduce((n, t) => n + t.amount, 0)
  if (spent !== m.spent) errors.push(`spending in ${m.month}: app ${spent}, server ${m.spent}`)
  const byDay = groupByDay([...inMonth].reverse(), typeOf).reduce((n, g) => n + g.spent, 0)
  if (byDay !== m.spent) errors.push(`day groups in ${m.month} add to ${byDay}, server ${m.spent}`)
}
for (const a of cash) {
  const today = dailyBalances(a as Account, rows, b.start, b.today).values.at(-1)
  if (today !== expected.get(a.id)) errors.push(`${a.name} today: Accounts tab ${today}, reconcile ${expected.get(a.id)}`)
}
if (facts) {
  for (const [c, s] of Object.entries(facts.dollars as Record<string, string>)) {
    const mine = formatCents(Number(c)).replace('−', '-')
    if (mine !== s) errors.push(`formatCents(${c}) = ${mine}, server dollars() = ${s}`)
  }
  for (const [type, from, to, ok] of facts.validate as [CatType, number | null, number | null, boolean][]) {
    if (fits({ from_id: from, to_id: to }, type) !== ok) errors.push(`fits(${type}, ${from}, ${to}) = ${!ok}, server says ${ok}`)
  }
}

for (const n of [...notes].sort()) console.log(`note: ${n}`)
if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`)
  process.exit(1)
}
console.log(`contract ok: ${rows.length} entries, ${b.months.length} months, ${cash.length} cash and card accounts`)
