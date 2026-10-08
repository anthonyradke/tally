import { GLYPHS, KIND_SYMBOL } from '@/icons/categories'
import type { Account } from '@/lib/api'
import { isTint, useTheme } from '@/theme'
import { Mark } from './Mark'

/** The color an account wears: its bank's, else violet for investments and grey for the rest. */
export const bankKey = (a: Pick<Account, 'bank' | 'kind'>) => a.bank ?? (a.kind === 'investment' ? 'roth' : 'hsa')

/** An account's symbol and color: its own if picked in Settings (a car for a car loan), else its kind's symbol on its
 *  bank's color. */
export function useAccountLook(a: Pick<Account, 'bank' | 'kind' | 'icon' | 'color'>) {
  const { bank, tint } = useTheme()
  const [sf, md] = a.icon && GLYPHS[a.icon] ? GLYPHS[a.icon] : KIND_SYMBOL[a.kind]
  return { sf, md, tint: isTint(a.color) ? tint(a.color) : bank(bankKey(a)) }
}

export function AccountMark({ a, size }: { a: Pick<Account, 'bank' | 'kind' | 'icon' | 'color'>; size?: number }) {
  const v = useAccountLook(a)
  return <Mark kind="glyph" sf={v.sf} md={v.md} tint={v.tint} size={size} />
}
