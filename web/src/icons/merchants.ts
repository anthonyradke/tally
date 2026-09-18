import {
  siAmericanexpress, siApple, siChase, siClaude, siIcloud, siMcdonalds, siRobinhood, siTarget, siTesla, siVenmo,
} from 'simple-icons'

/** A row's leading mark: a real brand glyph where simple-icons has one, otherwise a brand-colored monogram. */
export type MarkSpec =
  | { kind: 'brand'; path: string; color: string; title: string }
  | { kind: 'mono'; letter: string; color: string; title: string }

type SI = { path: string; hex: string; title: string }
const brand = (i: SI, color?: string): MarkSpec => ({ kind: 'brand', path: i.path, color: color ?? `#${i.hex}`, title: i.title })
const mono = (letter: string, color: string, title: string): MarkSpec => ({ kind: 'mono', letter, color, title })

// First match wins. Keep specific names above generic words.
const RULES: Array<[RegExp, MarkSpec]> = [
  [/mcdonald/i,               brand(siMcdonalds)],
  [/tesla/i,                  brand(siTesla)],
  [/icloud/i,                 brand(siIcloud)],
  [/\bapple\b/i,              brand(siApple, 'var(--fg)')],
  [/claude|anthropic/i,       brand(siClaude)],
  [/venmo/i,                  brand(siVenmo)],
  [/robinhood/i,              brand(siRobinhood)],
  [/\btarget\b/i,             brand(siTarget)],
  [/\bchase\b/i,              brand(siChase, 'var(--bank-chase)')],
  [/\bamex\b|american express/i, brand(siAmericanexpress, 'var(--bank-amex)')],
  [/amazon/i,                 mono('a', '#FF9900', 'Amazon')],
  [/costco/i,                 mono('C', '#E31837', 'Costco')],
  [/walmart/i,                mono('W', '#0071CE', 'Walmart')],
  [/king soopers|kroger/i,    mono('K', '#E4002B', 'King Soopers')],
  [/chick-?fil-?a/i,          mono('C', '#DD0031', 'Chick-fil-A')],
  [/jimmy john/i,             mono('J', '#C8102E', "Jimmy John's")],
  [/little caesars/i,         mono('L', '#FF6900', 'Little Caesars')],
  [/texas roadhouse/i,        mono('T', '#A3261F', 'Texas Roadhouse')],
  [/\bxcel\b/i,               mono('X', '#1F6FB2', 'Xcel Energy')],
  [/xfinity|comcast/i,        mono('X', '#7B2CBF', 'Xfinity')],
  [/\bvasa\b/i,               mono('V', '#2F5BEA', 'Vasa Fitness')],
  [/\bsofi\b/i,               mono('S', 'var(--bank-sofi)', 'SoFi')],
  [/\bbetr\b/i,               mono('B', '#16A34A', 'Betr')],
  [/liberty health/i,         mono('L', '#0E7490', 'Liberty HealthShare')],
  [/paycheck/i,               mono('$', 'var(--pos)', 'Paycheck')],
]

export function merchantMark(what: string): MarkSpec | null {
  for (const [re, spec] of RULES) if (re.test(what)) return spec
  return null
}
