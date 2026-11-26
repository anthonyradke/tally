// The ticker on Accounts: each account's symbol, the month's move and whether it's good news, how it reads, and the
// loop's arithmetic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copiesFor, itemAt, itemLabel, moveText, NET, pctText, stripLabel, tickerItems, tickerSymbol, tickerSymbols, wrap } from '@/design/ticker'
import { acct, month } from './fixtures'

const sym = (name: string, kind: Parameters<typeof acct>[1], bank: string | null = null) => {
  const a = acct(1, kind, 0, { name, bank })
  return tickerSymbol(a, [a])
}

test('a symbol comes from the bank, or from what the account is when that says more', () => {
  assert.equal(sym('Checking', 'cash', 'chase'), 'CHASE')
  assert.equal(sym('Blue Cash', 'card', 'amex'), 'AMEX')
  assert.equal(sym('Amex Blue Cash', 'card'), 'AMEX')
  assert.equal(sym('X Money', 'cash', 'x'), 'XMNY')
  assert.equal(sym('Roth IRA', 'investment', 'schwab'), 'ROTH')
  assert.equal(sym('Savings', 'cash', 'sofi'), 'SOFI')
  assert.equal(sym('Auto loan', 'loan', 'wells'), 'AUTO')
  assert.equal(sym('Tesla loan', 'loan', 'wells fargo'), 'TSLA')
  assert.equal(sym('401(k)', 'investment', 'empower'), '401K')
  assert.equal(sym('HSA', 'investment', 'hsa'), 'HSA')
  assert.equal(sym('Student loan', 'loan'), 'STU')
})

test('without a bank, a plain word or the name itself', () => {
  assert.equal(sym('Checking', 'cash'), 'CHK')
  assert.equal(sym('Credit card', 'card'), 'CARD')
  assert.equal(sym('Alex (owes me)', 'cash'), 'ALEX')
  assert.equal(sym('Envelope', 'cash'), 'ENVE')
  assert.equal(sym('Rainy day jar', 'cash'), 'RDJ')
  assert.equal(sym('Everyday', 'cash', 'First Bank'), 'FIRST')
  assert.equal(sym('', 'loan'), 'LOAN')
})

test('two accounts that would share a symbol both move to their next one', () => {
  const all = [acct(1, 'cash', 0, { name: 'Checking', bank: 'chase' }), acct(2, 'card', 0, { name: 'Freedom', bank: 'chase' }),
    acct(3, 'cash', 0, { name: 'Savings', bank: 'sofi' })]
  const s = tickerSymbols(all)
  assert.deepEqual([s.get(1), s.get(2), s.get(3)], ['CHK', 'FREE', 'SOFI'])
  assert.equal(tickerSymbol(all[1], all), 'FREE')
})

test('a tie nothing settles gets a number, and no account is NET', () => {
  const all = [acct(1, 'cash', 0, { name: 'Checking', bank: 'chase' }), acct(2, 'cash', 0, { name: 'Checking', bank: 'chase' }),
    acct(3, 'cash', 0, { name: 'Checking', bank: 'chase' }), acct(4, 'cash', 0, { name: 'Net' })]
  const s = tickerSymbols(all)
  assert.deepEqual([s.get(1), s.get(2), s.get(3)], ['CHK', 'CHK2', 'CHK3'])
  assert.notEqual(s.get(4), NET)
  assert.equal(new Set(s.values()).size, 4)
})

test('symbols stay unique across many accounts', () => {
  const names = ['Checking', 'Savings', 'Checking', 'Card', 'Card', 'Roth IRA', 'Roth IRA', 'Auto loan', 'Cash', 'Cash']
  const all = names.map((n, i) => acct(i + 1, i % 2 ? 'card' : 'cash', 0, { name: n, bank: i % 3 ? 'chase' : null }))
  const s = tickerSymbols(all)
  assert.equal(new Set(s.values()).size, all.length)
  for (const v of s.values()) assert.match(v, /^[A-Z0-9]{2,6}$/)
})

const accounts = [acct(1, 'cash', 0, { name: 'Checking', bank: 'chase' }), acct(2, 'card', 0, { name: 'Credit card', bank: 'amex' }),
  acct(3, 'loan', 0, { name: 'Student loan' }), acct(4, 'investment', 0, { name: 'Roth IRA' })]
const before = month('2026-10-01', { net_worth: 100000, balances: { 1: 800000, 2: 50000, 3: 1000000, 4: 0 } })
const now = month('2026-11-01', { net_worth: 112000, balances: { 1: 812000, 2: 62000, 3: 990000, 4: 50000 } })

test('net worth first, then each account in the order given, with the month\'s move', () => {
  const items = tickerItems([accounts[1], accounts[0], accounts[2], accounts[3]], accounts, now, before)
  assert.deepEqual(items.map((t) => t.symbol), ['NET', 'AMEX', 'CHASE', 'STU', 'ROTH'])
  assert.deepEqual(items.map((t) => t.change), [12000, 12000, 12000, -10000, 50000])
  assert.equal(items[0].id, null)
  assert.equal(items[2].name, 'Chase Checking')
  assert.ok(Math.abs(items[0].pct! - 12) < 1e-9)
  assert.ok(Math.abs(items[2].pct! - 1.5) < 1e-9)
  assert.equal(items[4].pct, null) // nothing last month to compare with
})

test('cash up is good; a card or loan balance going up is bad, going down good', () => {
  const items = tickerItems(accounts, accounts, now, before)
  const mood = Object.fromEntries(items.map((t) => [t.symbol, t.mood]))
  assert.deepEqual(mood, { NET: 'good', CHASE: 'good', AMEX: 'bad', STU: 'good', ROTH: 'good' })
  const flat = tickerItems(accounts, accounts, now, now)
  assert.ok(flat.every((t) => t.mood === 'flat' && t.change === 0))
})

test('before this month has a row, nothing has moved', () => {
  const items = tickerItems(accounts, accounts, before, undefined)
  assert.ok(items.every((t) => t.change === 0 && t.pct === null && t.mood === 'flat'))
  assert.deepEqual(tickerItems(accounts, accounts, undefined, undefined), [])
})

test('how a move and its percent read', () => {
  assert.equal(moveText(12000), '▲ $120')
  assert.equal(moveText(-4049), '▼ $40')
  assert.equal(moveText(40), '▲ $0.40')
  assert.equal(moveText(0), '—')
  assert.equal(pctText(1.5), '1.5%')
  assert.equal(pctText(-12.345), '12.3%')
  assert.equal(pctText(0.04), '<0.1%')
  assert.equal(pctText(250.4), '250%')
  assert.equal(pctText(999.4), '999%')
  assert.equal(pctText(5000), null)
  assert.equal(pctText(null), null)
  assert.equal(pctText(0), null)
})

test('VoiceOver reads each item and the whole strip', () => {
  const items = tickerItems(accounts, accounts, now, before)
  assert.equal(itemLabel(items[1]), 'Chase Checking, $8,120, up $120 this month')
  assert.equal(itemLabel(items[3]), 'Student loan, $9,900, down $100 this month')
  assert.equal(itemLabel({ ...items[1], change: 0 }), 'Chase Checking, $8,120, no change this month')
  assert.match(stripLabel(items), /^Ticker: Net worth up \$120; Chase Checking up \$120; /)
})

test('the loop folds back into one run and a tap finds its item', () => {
  assert.equal(wrap(0, 300), 0)
  assert.equal(wrap(-310, 300), -10)
  assert.equal(wrap(20, 300), -280)
  assert.equal(wrap(-50, 0), 0)
  const starts = [0, 100, 180]
  assert.equal(itemAt(10, 0, starts, 300), 0)
  assert.equal(itemAt(10, -95, starts, 300), 1) // 105 into the run
  assert.equal(itemAt(250, -95, starts, 300), 0) // 345 → the second copy's first item
  assert.equal(itemAt(10, 0, [], 300), -1)
  assert.equal(copiesFor(402, 1000), 2)
  assert.equal(copiesFor(402, 150), 4)
  assert.equal(copiesFor(402, 0), 1)
})
