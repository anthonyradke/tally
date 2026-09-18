import type { Account } from '@/api/client'
import { isTint, tintVar } from './glyphs'

export const BANKS = [
  { value: 'chase', label: 'Chase' }, { value: 'amex', label: 'Amex' }, { value: 'sofi', label: 'SoFi' },
  { value: 'hsa', label: 'Grey' }, { value: 'roth', label: 'Violet' },
]

/** CSS color for an account's identity dot / mark: explicit tint → bank identity → kind fallback. */
export function bankColor(a: Pick<Account, 'bank' | 'kind' | 'color'>): string {
  if (isTint(a.color)) return tintVar(a.color)
  if (a.bank) return `var(--bank-${a.bank})`
  if (a.kind === 'investment') return 'var(--bank-roth)'
  return 'var(--bank-hsa)'
}

export const KIND_LABEL: Record<Account['kind'], string> = {
  cash: 'Cash', card: 'Cards', investment: 'Investments', loan: 'Loans',
}
export const KIND_OPTIONS = [
  { value: 'cash', label: 'Cash', hint: 'checking, savings' }, { value: 'card', label: 'Credit card', hint: 'balance owed' },
  { value: 'investment', label: 'Investment', hint: 'typed monthly' }, { value: 'loan', label: 'Loan', hint: 'accrues monthly' },
]
