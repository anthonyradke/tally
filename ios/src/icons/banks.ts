// Account logos: the bank or provider behind an account, drawn white (or dark) on its brand color. A simple-icons
// glyph where one exists; otherwise a short wordmark or letter set in the brand's style, since the real logos are
// wordmarks that don't read at 30 px. Ids are stored as `logo:<id>` in an account's icon; never rename one.
import { BRANDS } from './brands'

export interface Logo {
  title: string
  /** Disc and glyph colors, [light, dark]. */
  bg: [string, string]
  fg: [string, string]
  /** A simple-icons path (24×24), or text set in the system font (serif for Schwab's). */
  path?: string
  text?: string
  /** Glyph or text size as a fraction of the disc. */
  scale: number
  weight?: '400' | '600' | '700' | '800'
  serif?: boolean
}

const glyph = (name: string, scale: number, bg: Logo['bg'], fg: Logo['fg'] = ['#FFFFFF', '#FFFFFF']) =>
  ({ title: BRANDS[name].title, path: BRANDS[name].path, scale, bg, fg })
const same = (c: string): [string, string] => [c, c]
const white = same('#FFFFFF')

export const LOGOS: Record<string, Logo> = {
  chase: glyph('siChase', 0.5, same('#117ACA')),
  amex: glyph('siAmericanexpress', 0.64, same('#2E77BC')),
  sofi: { title: 'SoFi', text: 'SoFi', scale: 0.3, weight: '800', bg: same('#00A2C7'), fg: white },
  wells: glyph('siWellsfargo', 0.62, same('#D71E28')),
  x: { ...glyph('siX', 0.42, ['#000000', '#FFFFFF'], ['#FFFFFF', '#000000']), title: 'X Money' },
  schwab: { title: 'Charles Schwab', text: 'S', scale: 0.5, weight: '600', serif: true, bg: same('#00A0DF'), fg: white },
  empower: { title: 'Empower', text: 'e', scale: 0.55, weight: '700', bg: same('#002157'), fg: white },
  alight: { title: 'Alight', text: 'a', scale: 0.55, weight: '700', bg: same('#FFF200'), fg: same('#0A2029') },
  mohela: { title: 'MOHELA', text: 'M', scale: 0.42, weight: '800', bg: same('#0775BC'), fg: white },
}
export const LOGO_IDS = Object.keys(LOGOS)

/** An account's logo: the one picked in Settings (`logo:<id>`), else its bank's when it has no symbol or color of its own. */
export function accountLogo(a: { bank: string | null; icon: string | null; color: string | null }): Logo | null {
  if (a.icon?.startsWith('logo:')) return LOGOS[a.icon.slice(5)] ?? null
  if (a.icon || a.color || !a.bank) return null
  return LOGOS[a.bank.toLowerCase()] ?? null
}
