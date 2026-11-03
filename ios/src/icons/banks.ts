// Account logos: the bank or provider behind an account, on a disc of its brand color. Wordmarks (Amex, Wells Fargo,
// Schwab) sit on the disc without their square; Chase and X are simple-icons glyphs; the rest are a short wordmark or
// letter in the brand's style. Ids are stored as `logo:<id>` in an account's icon; never rename one.
import { BRANDS } from './brands'
import { ALIGHT, AMEX_WORDMARK, EMPOWER, MOHELA, SCHWAB_WORDMARK, SOFI, WELLS_WORDMARK } from './logoPaths'

export interface Logo {
  title: string
  /** Disc and glyph colors, [light, dark]. */
  bg: [string, string]
  fg: [string, string]
  path: string
  /** The path's ink bounds [x, y, w, h]: the mark is drawn centered on these, never on the 24×24 box or a text line. */
  box: [number, number, number, number]
  /** The ink's longer side as a fraction of the disc. */
  scale: number
  evenodd?: boolean
}

const glyph = (name: string, box: Logo['box'], scale: number, bg: Logo['bg'], fg: Logo['fg'] = ['#FFFFFF', '#FFFFFF']): Logo =>
  ({ title: BRANDS[name].title, path: BRANDS[name].path, box, scale, bg, fg })
const same = (c: string): [string, string] => [c, c]
const white = same('#FFFFFF')

export const LOGOS: Record<string, Logo> = {
  chase: glyph('siChase', [0, 0, 24, 24], 0.5, same('#117ACA')),
  amex: { title: 'American Express', ...AMEX_WORDMARK, scale: 0.78, bg: same('#2E77BC'), fg: white },
  sofi: { title: 'SoFi', ...SOFI, scale: 0.6, bg: same('#00A2C7'), fg: white },
  wells: { title: 'Wells Fargo', ...WELLS_WORDMARK, scale: 0.72, evenodd: true, bg: same('#D71E28'), fg: same('#FFCD41') },
  x: { ...glyph('siX', [0.258, 0, 23.484, 24], 0.42, ['#000000', '#FFFFFF'], ['#FFFFFF', '#000000']), title: 'X Money' },
  schwab: { title: 'Charles Schwab', ...SCHWAB_WORDMARK, scale: 0.74, bg: same('#00A0DF'), fg: white },
  empower: { title: 'Empower', ...EMPOWER, scale: 0.34, bg: same('#002157'), fg: white },
  alight: { title: 'Alight', ...ALIGHT, scale: 0.34, bg: same('#FFF200'), fg: same('#0A2029') },
  mohela: { title: 'MOHELA', ...MOHELA, scale: 0.38, bg: same('#0775BC'), fg: white },
}
export const LOGO_IDS = Object.keys(LOGOS)

/** An account's logo: the one picked in Settings (`logo:<id>`), else its bank's when it has no symbol or color of its own. */
export function accountLogo(a: { bank: string | null; icon: string | null; color: string | null }): Logo | null {
  if (a.icon?.startsWith('logo:')) return LOGOS[a.icon.slice(5)] ?? null
  if (a.icon || a.color || !a.bank) return null
  return LOGOS[a.bank.toLowerCase()] ?? null
}
