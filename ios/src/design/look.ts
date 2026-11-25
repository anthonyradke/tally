// How things look in the New design that the data doesn't say: a symbol and a color for each category, account kind
// and entry type, and how an amount reads. Chosen by what the name says, like Apple Card colors its categories.
import type { SFSymbol } from 'expo-symbols'
import type { Account, CatType, Category, Kind } from '@/lib/api'
import type { Hue } from './theme'

interface Look { symbol: SFSymbol; hue: Hue }

const BY_WORD: [RegExp, Look][] = [
  [/grocer|supermarket/i, { symbol: 'cart.fill', hue: 'green' }],
  [/dining|restaurant|food|eat|coffee|bar\b/i, { symbol: 'fork.knife', hue: 'orange' }],
  [/charg|electric car|ev\b/i, { symbol: 'bolt.car.fill', hue: 'teal' }],
  [/gas|fuel/i, { symbol: 'fuelpump.fill', hue: 'red' }],
  [/transport|car\b|auto|uber|parking|transit/i, { symbol: 'car.fill', hue: 'blue' }],
  [/shop/i, { symbol: 'bag.fill', hue: 'pink' }],
  [/bill|utilit|home|rent|housing/i, { symbol: 'house.fill', hue: 'yellow' }],
  [/subscri/i, { symbol: 'repeat', hue: 'indigo' }],
  [/entertain|fun|movie|music|game/i, { symbol: 'tv.fill', hue: 'purple' }],
  [/gambl|casino|bet/i, { symbol: 'suit.spade.fill', hue: 'purple' }],
  [/health|fitness|medical|gym|pharm/i, { symbol: 'heart.fill', hue: 'red' }],
  [/travel|flight|hotel/i, { symbol: 'airplane', hue: 'cyan' }],
  [/pet/i, { symbol: 'pawprint.fill', hue: 'brown' }],
  [/gift|donat|charit/i, { symbol: 'gift.fill', hue: 'pink' }],
  [/fee|charge/i, { symbol: 'exclamationmark.circle.fill', hue: 'gray' }],
  [/service/i, { symbol: 'wrench.and.screwdriver.fill', hue: 'gray' }],
  [/paycheck|salary|wage|payroll/i, { symbol: 'dollarsign', hue: 'green' }],
  [/interest|dividend/i, { symbol: 'percent', hue: 'green' }],
  [/contract|freelance|income/i, { symbol: 'briefcase.fill', hue: 'green' }],
  [/credit card/i, { symbol: 'creditcard.fill', hue: 'blue' }],
  [/student/i, { symbol: 'graduationcap.fill', hue: 'indigo' }],
  [/loan|lent|owe/i, { symbol: 'arrow.uturn.left', hue: 'indigo' }],
  [/roth|ira|invest|401|retire|saving/i, { symbol: 'chart.line.uptrend.xyaxis', hue: 'mint' }],
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
