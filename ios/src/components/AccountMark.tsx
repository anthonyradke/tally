import { KIND_SYMBOL } from '@/icons/categories'
import type { Account } from '@/lib/api'
import { useTheme } from '@/theme'
import { Mark } from './Mark'

/** The color an account wears: its bank's, else violet for investments and grey for the rest. */
export const bankKey = (a: Pick<Account, 'bank' | 'kind'>) => a.bank ?? (a.kind === 'investment' ? 'roth' : 'hsa')

/** An account's round mark: the symbol for its kind on its bank's color. */
export function AccountMark({ a, size }: { a: Pick<Account, 'bank' | 'kind' | 'icon' | 'color'>; size?: number }) {
  const { bank } = useTheme()
  return <Mark kind="glyph" sf={KIND_SYMBOL[a.kind][0]} md={KIND_SYMBOL[a.kind][1]} tint={bank(bankKey(a))} size={size} />
}
