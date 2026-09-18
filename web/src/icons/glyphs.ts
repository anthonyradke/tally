import {
  ArrowLeftRight, Baby, Banknote, Briefcase, Bus, Calculator, Camera, Car, CircleDollarSign, Coffee, CreditCard,
  Droplets, Dumbbell, Flame, Fuel, Gamepad2, Gift, GraduationCap, Hammer, HandCoins, HeartHandshake, HeartPulse,
  House, Landmark, Lightbulb, Music, PawPrint, PiggyBank, Pill, Plane, Popcorn, Receipt, Repeat, Shirt, ShoppingBag,
  ShoppingCart, Smartphone, Sparkles, Stethoscope, Ticket, Tv, Utensils, Wifi, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react'

/** The glyphs a category (or quick action) can pick in Settings. Keys are stored in the DB. */
export const GLYPHS: Record<string, LucideIcon> = {
  banknote: Banknote, 'hand-coins': HandCoins, 'circle-dollar': CircleDollarSign, briefcase: Briefcase,
  'graduation-cap': GraduationCap, 'heart-handshake': HeartHandshake, landmark: Landmark, 'piggy-bank': PiggyBank,
  'credit-card': CreditCard, 'arrow-left-right': ArrowLeftRight, receipt: Receipt, calculator: Calculator,
  car: Car, fuel: Fuel, bus: Bus, plane: Plane, house: House, zap: Zap, droplets: Droplets, wifi: Wifi, flame: Flame,
  lightbulb: Lightbulb, hammer: Hammer, wrench: Wrench, 'shopping-cart': ShoppingCart, 'shopping-bag': ShoppingBag,
  shirt: Shirt, gift: Gift, utensils: Utensils, coffee: Coffee, popcorn: Popcorn, ticket: Ticket, tv: Tv, music: Music,
  gamepad: Gamepad2, repeat: Repeat, smartphone: Smartphone, camera: Camera, 'heart-pulse': HeartPulse,
  stethoscope: Stethoscope, pill: Pill, dumbbell: Dumbbell, baby: Baby, 'paw-print': PawPrint, sparkles: Sparkles,
}
export const GLYPH_NAMES = Object.keys(GLYPHS)

export const TINTS = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink', 'gray'] as const
export type Tint = (typeof TINTS)[number]
export const tintVar = (t: string) => `var(--tint-${t})`
export const isTint = (t: string | null | undefined): t is Tint => !!t && (TINTS as readonly string[]).includes(t)
