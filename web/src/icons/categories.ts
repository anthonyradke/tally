import type { LucideIcon } from 'lucide-react'
import type { CatType } from '@/api/client'
import { GLYPHS, isTint, tintVar, type Tint } from './glyphs'

export interface Visual { Icon: LucideIcon; color: string; glyph: string; tint: Tint }

// Defaults keyed by category name. A category's own icon/color (set in Settings) override these.
const BY_NAME: Record<string, [string, Tint]> = {
  'Paycheck': ['banknote', 'green'], 'Other Income': ['hand-coins', 'green'],
  'Student Loan Payment': ['graduation-cap', 'amber'], 'Family / Personal Loan Payment': ['heart-handshake', 'amber'],
  'Roth IRA': ['landmark', 'violet'], 'HYSA Transfer': ['piggy-bank', 'teal'], 'Credit Card Payment': ['credit-card', 'gray'],
  'Car': ['car', 'blue'], 'Gas': ['fuel', 'amber'], 'Home / Utilities': ['house', 'teal'], 'Groceries': ['shopping-cart', 'green'],
  'Dining Out': ['utensils', 'orange'], 'Subscriptions': ['repeat', 'violet'], 'Shopping': ['shopping-bag', 'pink'],
  'Health': ['heart-pulse', 'red'], 'Entertainment': ['popcorn', 'blue'], 'Misc': ['sparkles', 'gray'], 'Pets': ['paw-print', 'orange'],
}
const BY_TYPE: Record<CatType, [string, Tint]> = {
  'Money in': ['banknote', 'green'], 'Spending': ['circle-dollar', 'gray'], 'Saving': ['piggy-bank', 'teal'],
  'Transfer': ['arrow-left-right', 'gray'], 'Loan': ['hand-coins', 'amber'],
}

interface CatLike { name: string; type: CatType; icon?: string | null; color?: string | null }

/** Resolve a category's glyph + tint: explicit override → name default → type default. */
export function categoryVisual(c: CatLike): Visual {
  const [dGlyph, dTint] = BY_NAME[c.name] ?? BY_TYPE[c.type]
  const glyph = c.icon && GLYPHS[c.icon] ? c.icon : dGlyph
  const tint = isTint(c.color) ? c.color : dTint
  return { Icon: GLYPHS[glyph], color: tintVar(tint), glyph, tint }
}
