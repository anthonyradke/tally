import {
  ArrowLeftRight, Banknote, Car, CircleDollarSign, CreditCard, Fuel, GraduationCap, HandCoins, HeartHandshake,
  HeartPulse, House, Landmark, PawPrint, PiggyBank, Popcorn, Repeat, ShoppingBag, ShoppingCart, Sparkles, Utensils,
  type LucideIcon,
} from 'lucide-react'
import type { CatType } from '@/api/client'

export interface Visual { Icon: LucideIcon; color: string }

// Defaults keyed by category name; Settings will let the user override icon + tint per category (phase 3).
const BY_NAME: Record<string, Visual> = {
  'Paycheck':                       { Icon: Banknote,       color: 'var(--tint-green)' },
  'Other Income':                   { Icon: HandCoins,      color: 'var(--tint-green)' },
  'Student Loan Payment':           { Icon: GraduationCap,  color: 'var(--tint-amber)' },
  'Family / Personal Loan Payment': { Icon: HeartHandshake, color: 'var(--tint-amber)' },
  'Roth IRA':                       { Icon: Landmark,       color: 'var(--tint-violet)' },
  'HYSA Transfer':                  { Icon: PiggyBank,      color: 'var(--tint-teal)' },
  'Credit Card Payment':            { Icon: CreditCard,     color: 'var(--tint-gray)' },
  'Car':                            { Icon: Car,            color: 'var(--tint-blue)' },
  'Gas':                            { Icon: Fuel,           color: 'var(--tint-amber)' },
  'Home / Utilities':               { Icon: House,          color: 'var(--tint-teal)' },
  'Groceries':                      { Icon: ShoppingCart,   color: 'var(--tint-green)' },
  'Dining Out':                     { Icon: Utensils,       color: 'var(--tint-orange)' },
  'Subscriptions':                  { Icon: Repeat,         color: 'var(--tint-violet)' },
  'Shopping':                       { Icon: ShoppingBag,    color: 'var(--tint-pink)' },
  'Health':                         { Icon: HeartPulse,     color: 'var(--tint-red)' },
  'Entertainment':                  { Icon: Popcorn,        color: 'var(--tint-violet)' },
  'Misc':                           { Icon: Sparkles,       color: 'var(--tint-gray)' },
  'Pets':                           { Icon: PawPrint,       color: 'var(--tint-orange)' },
}

const BY_TYPE: Record<CatType, Visual> = {
  'Money in': { Icon: Banknote,         color: 'var(--tint-green)' },
  'Spending': { Icon: CircleDollarSign, color: 'var(--tint-gray)' },
  'Saving':   { Icon: PiggyBank,        color: 'var(--tint-teal)' },
  'Transfer': { Icon: ArrowLeftRight,   color: 'var(--tint-gray)' },
  'Loan':     { Icon: HandCoins,        color: 'var(--tint-amber)' },
}

export const categoryVisual = (name: string, type: CatType): Visual => BY_NAME[name] ?? BY_TYPE[type]
