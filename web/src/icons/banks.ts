import type { Account } from '@/api/client'

/** CSS color for an account's identity dot / mark. Falls back by kind when no bank is set. */
export function bankColor(a: Account): string {
  if (a.bank) return `var(--bank-${a.bank})`
  if (a.kind === 'investment') return 'var(--bank-roth)'
  return 'var(--bank-hsa)'
}

export const KIND_LABEL: Record<Account['kind'], string> = {
  cash: 'Cash', card: 'Cards', investment: 'Investments', loan: 'Loans',
}
