// Category glyphs. Keys are the ones Tally stores in the DB (they were lucide names on the web); each maps to an SF
// Symbol on iOS and a Material Symbol for the web preview.
import type { SFSymbol } from 'expo-symbols'
import type { CatType } from '@/lib/api'
import { isTint, type Tint } from '@/theme'

type G = [SFSymbol, string]
export const GLYPHS: Record<string, G> = {
  banknote: ['banknote.fill', 'payments'], 'hand-coins': ['dollarsign.circle.fill', 'paid'],
  'circle-dollar': ['dollarsign.circle', 'attach_money'], briefcase: ['briefcase.fill', 'work'],
  'graduation-cap': ['graduationcap.fill', 'school'], 'heart-handshake': ['person.2.fill', 'handshake'],
  landmark: ['building.columns.fill', 'account_balance'], 'piggy-bank': ['chart.line.uptrend.xyaxis', 'savings'],
  'credit-card': ['creditcard.fill', 'credit_card'], 'arrow-left-right': ['arrow.left.arrow.right', 'swap_horiz'],
  receipt: ['receipt.fill', 'receipt_long'], calculator: ['plus.forwardslash.minus', 'calculate'],
  car: ['car.fill', 'directions_car'], fuel: ['fuelpump.fill', 'local_gas_station'], bus: ['bus.fill', 'directions_bus'],
  plane: ['airplane', 'flight'], house: ['house.fill', 'home'], zap: ['bolt.fill', 'bolt'], droplets: ['drop.fill', 'water_drop'],
  wifi: ['wifi', 'wifi'], flame: ['flame.fill', 'local_fire_department'], lightbulb: ['lightbulb.fill', 'lightbulb'],
  hammer: ['hammer.fill', 'hardware'], wrench: ['wrench.fill', 'build'], 'shopping-cart': ['cart.fill', 'shopping_cart'],
  'shopping-bag': ['bag.fill', 'shopping_bag'], shirt: ['tshirt.fill', 'checkroom'], gift: ['gift.fill', 'redeem'],
  utensils: ['fork.knife', 'restaurant'], coffee: ['cup.and.saucer.fill', 'local_cafe'], popcorn: ['popcorn.fill', 'theaters'],
  ticket: ['ticket.fill', 'confirmation_number'], tv: ['tv.fill', 'tv'], music: ['music.note', 'music_note'],
  gamepad: ['gamecontroller.fill', 'sports_esports'], repeat: ['repeat', 'repeat'], smartphone: ['iphone', 'smartphone'],
  camera: ['camera.fill', 'photo_camera'], 'heart-pulse': ['cross.case.fill', 'medical_services'],
  stethoscope: ['stethoscope', 'stethoscope'], pill: ['pills.fill', 'medication'], dumbbell: ['dumbbell.fill', 'fitness_center'],
  baby: ['stroller.fill', 'child_friendly'], 'paw-print': ['pawprint.fill', 'pets'], sparkles: ['sparkles', 'auto_awesome'],
}
export const GLYPH_NAMES = Object.keys(GLYPHS)

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

export interface Visual { sf: SFSymbol; md: string; glyph: string; tint: Tint }
interface CatLike { name: string; type: CatType; icon?: string | null; color?: string | null }

/** Resolve a category's glyph + tint: explicit override → name default → type default. */
export function categoryVisual(c: CatLike): Visual {
  const [dGlyph, dTint] = BY_NAME[c.name] ?? BY_TYPE[c.type]
  const glyph = c.icon && GLYPHS[c.icon] ? c.icon : dGlyph
  const tint = isTint(c.color) ? c.color : dTint
  const [sf, md] = GLYPHS[glyph]
  return { sf, md, glyph, tint }
}

export const KIND_LABEL = { cash: 'Cash', card: 'Credit cards', investment: 'Investments', loan: 'Loans' } as const
export const KIND_SYMBOL: Record<keyof typeof KIND_LABEL, [SFSymbol, string]> = {
  cash: ['banknote.fill', 'payments'], card: ['creditcard.fill', 'credit_card'],
  investment: ['chart.line.uptrend.xyaxis', 'trending_up'], loan: ['graduationcap.fill', 'school'],
}
