// How things look in the New design that the data doesn't say: a symbol and a color for each category, account kind
// and entry type, and how an amount reads. Chosen by what the name says, like Apple Card colors its categories.
import type { SFSymbol } from 'expo-symbols'
import type { Account, CatType, Category, Kind } from '@/lib/api'
import type { Hue } from './theme'

interface Look { symbol: SFSymbol; hue: Hue }

// Every word is matched from its start (\b), so "Entertainment" isn't rent, "Theater" isn't eating and "Emergency
// Fund" isn't fun. First match wins: fees come before EV charging, so "Fees & Charges" isn't a car.
const BY_WORD: [RegExp, Look][] = [
  [/\b(grocer|supermarket)/i, { symbol: 'cart.fill', hue: 'green' }],
  [/\b(dining|restaurants?\b|food|eat(s|ing)?\b|coffee|cafe|bars?\b)/i, { symbol: 'fork.knife', hue: 'orange' }],
  [/\b(fees?|charges?)\b/i, { symbol: 'exclamationmark.circle.fill', hue: 'gray' }],
  [/\b(charging|supercharg|electric car|ev)\b/i, { symbol: 'bolt.car.fill', hue: 'teal' }],
  [/\b(gas|fuel|petrol)/i, { symbol: 'fuelpump.fill', hue: 'red' }],
  [/\b(transport|cars?\b|auto|uber|lyft|parking|transit|taxi)/i, { symbol: 'car.fill', hue: 'blue' }],
  [/\bshop/i, { symbol: 'bag.fill', hue: 'pink' }],
  [/\b(bills?\b|utilit|home|rent\b|rental|housing|mortgage)/i, { symbol: 'house.fill', hue: 'yellow' }],
  [/\bsubscri/i, { symbol: 'repeat', hue: 'indigo' }],
  [/\b(entertain|fun\b|movie|music|game|streaming)/i, { symbol: 'tv.fill', hue: 'purple' }],
  [/\b(gambl|casino|bet(s|ting)?\b)/i, { symbol: 'suit.spade.fill', hue: 'purple' }],
  [/\b(health|fitness|medical|gym|pharm|doctor|dental)/i, { symbol: 'heart.fill', hue: 'red' }],
  [/\b(travel|flight|hotel)/i, { symbol: 'airplane', hue: 'cyan' }],
  [/\bpets?\b/i, { symbol: 'pawprint.fill', hue: 'brown' }],
  [/\b(gift|donat|charit)/i, { symbol: 'gift.fill', hue: 'pink' }],
  [/\bservice/i, { symbol: 'wrench.and.screwdriver.fill', hue: 'gray' }],
  [/\b(paycheck|salary|wage|payroll)/i, { symbol: 'dollarsign', hue: 'green' }],
  [/\b(interest|dividend)/i, { symbol: 'percent', hue: 'green' }],
  [/\b(contract|freelance|income)/i, { symbol: 'briefcase.fill', hue: 'green' }],
  [/\bcredit cards?\b/i, { symbol: 'creditcard.fill', hue: 'blue' }],
  [/\bstudent/i, { symbol: 'graduationcap.fill', hue: 'indigo' }],
  [/\b(loans?|lent|owes?|owed|iou)\b/i, { symbol: 'arrow.uturn.left', hue: 'indigo' }],
  [/\b(roth|ira\b|invest|401|retire|saving)/i, { symbol: 'chart.line.uptrend.xyaxis', hue: 'mint' }],
]

const BY_TYPE: Record<CatType, Look> = {
  'Spending': { symbol: 'square.grid.2x2.fill', hue: 'gray' },
  'Money in': { symbol: 'arrow.down', hue: 'green' },
  'Transfer': { symbol: 'arrow.left.arrow.right', hue: 'blue' },
  'Loan': { symbol: 'arrow.uturn.left', hue: 'indigo' },
  'Saving': { symbol: 'chart.line.uptrend.xyaxis', hue: 'mint' },
}

export function categoryLook(c: Pick<Category, 'name' | 'type'> | undefined): Look {
  if (!c) return BY_TYPE.Spending
  if (c.type === 'Transfer' && !/credit card/i.test(c.name)) return BY_TYPE.Transfer
  return BY_WORD.find(([re]) => re.test(c.name))?.[1] ?? BY_TYPE[c.type]
}

export const KIND_LOOK: Record<Kind, Look & { title: string; one: string }> = {
  cash: { symbol: 'banknote.fill', hue: 'green', title: 'Cash', one: 'Cash' },
  card: { symbol: 'creditcard.fill', hue: 'blue', title: 'Credit Cards', one: 'Credit Card' },
  investment: { symbol: 'chart.line.uptrend.xyaxis', hue: 'mint', title: 'Investments', one: 'Investment' },
  loan: { symbol: 'building.columns.fill', hue: 'indigo', title: 'Loans', one: 'Loan' },
}

export const accountLook = (a: Pick<Account, 'kind'> | undefined): Look => KIND_LOOK[a?.kind ?? 'cash']

/** Whether an entry of this type shows its place's logo: purchases and pay do; moves between your own accounts
 *  show the symbol for the move instead. */
export const wantsLogo = (t: CatType | undefined) => t === 'Spending' || t === 'Money in'

/** How an amount reads in a list: money in is green with a +, a refund too; spending is plain; a move between your
 *  own accounts is quieter. */
export function amountLook(type: CatType | undefined, cents: number): { cents: number; plus: boolean; tone: 'pos' | 'plain' | 'quiet' } {
  if (type === 'Money in') return { cents, plus: cents > 0, tone: cents > 0 ? 'pos' : 'plain' }
  if (type === 'Spending') return cents < 0 ? { cents: -cents, plus: true, tone: 'pos' } : { cents, plus: false, tone: 'plain' }
  return { cents: Math.abs(cents), plus: false, tone: 'quiet' }
}

const BANKS: Record<string, string> = {
  amex: 'American Express', 'american express': 'American Express', wells: 'Wells Fargo', 'wells fargo': 'Wells Fargo',
  chase: 'Chase', sofi: 'SoFi', mohela: 'MOHELA', x: 'X', schwab: 'Charles Schwab', empower: 'Empower',
}
/** The bank under an account's name, as people write it ("wells" is Wells Fargo); null when it only repeats the
 *  kind (an "hsa" bank on an HSA). */
export function bankName(a: Pick<Account, 'bank' | 'name'>): string | null {
  const b = a.bank?.trim()
  if (!b || a.name.toLowerCase() === b.toLowerCase()) return null
  return BANKS[b.toLowerCase()] ?? b.replace(/\b\w/g, (c) => c.toUpperCase())
}
