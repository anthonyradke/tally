// Quick capture from a link: tally://new?amount=12.50&what=Starbucks&card=Amex. An iOS Shortcuts automation ("When I
// tap a card" in Wallet passes the merchant, amount and card) can open a new entry already filled in. What the link
// doesn't say comes from the last entry at the same place, like picking it under "What was it?".
import type { Bootstrap, CatType, Txn } from './api'
import type { Draft } from './draft'
import { fromCents } from './draft'
import { parseDollars } from './money'
import { merchantKey } from '@/icons/merchants'

export interface LinkParams { amount?: string; what?: string; card?: string; account?: string; category?: string }

const find = <T extends { name: string; active: boolean }>(list: T[], name?: string) => {
  const want = name?.trim().toLowerCase()
  if (!want) return undefined
  const live = list.filter((x) => x.active)
  return live.find((x) => x.name.toLowerCase() === want) ?? live.find((x) => x.name.toLowerCase().includes(want) || want.includes(x.name.toLowerCase()))
}

/** The parts of a draft a link fills in. `history` is newest first. */
export function fromLink(p: LinkParams, b: Bootstrap, history: Txn[]): Partial<Draft> {
  const out: Partial<Draft> = {}
  const cents = p.amount ? parseDollars(p.amount) : null
  if (cents) { out.amount = fromCents(Math.abs(cents)); if (cents < 0) out.refund = true }
  const what = p.what?.trim()
  if (what) {
    out.what = what
    const last = history.find((t) => merchantKey(t.what) === merchantKey(what))
    if (last) {
      const kind = b.categories.find((c) => c.id === last.category_id)?.type as CatType | undefined
      Object.assign(out, { category_id: last.category_id, from_id: last.from_id, to_id: last.to_id, ...(kind ? { kind } : {}) })
    }
  }
  const cat = find(b.categories, p.category)
  if (cat) Object.assign(out, { category_id: cat.id, kind: cat.type })
  const acct = find(b.accounts, p.card ?? p.account)
  if (acct) out.from_id = acct.id
  return out
}
