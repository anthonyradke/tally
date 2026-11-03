// Account logos: the bank or provider behind an account, drawn white (or dark) on its brand color. A simple-icons
// glyph where one exists; otherwise a short wordmark or letter in the brand's style, since the real logos are
// wordmarks that don't read at 30 px. Ids are stored as `logo:<id>` in an account's icon; never rename one.
import { BRANDS } from './brands'

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
}

const glyph = (name: string, box: Logo['box'], scale: number, bg: Logo['bg'], fg: Logo['fg'] = ['#FFFFFF', '#FFFFFF']): Logo =>
  ({ title: BRANDS[name].title, path: BRANDS[name].path, box, scale, bg, fg })
const same = (c: string): [string, string] => [c, c]
const white = same('#FFFFFF')

// Letter marks, outlined from Inter (SoFi, e, a, M) and Source Serif 4 (Schwab's S), both SIL OFL, so they center on
// their ink and look the same on every device. Bounds start at 0, 0.
const SOFI_PATH = 'M3.73 9.22Q2.54 9.22 1.71 8.86Q0.87 8.5 0.44 7.81Q0 7.11 0 6.13H2.06Q2.07 6.55 2.28 6.86Q2.48 7.17 2.86 7.33Q3.24 7.49 3.75 7.49Q4.21 7.49 4.55 7.37Q4.88 7.25 5.07 7.03Q5.26 6.81 5.26 6.52Q5.26 6.26 5.1 6.08Q4.94 5.89 4.61 5.75Q4.27 5.6 3.73 5.49L2.81 5.31Q1.5 5.04 0.84 4.4Q0.17 3.76 0.17 2.78Q0.17 1.95 0.61 1.32Q1.06 0.7 1.85 0.35Q2.64 0 3.69 0Q4.76 0 5.53 0.35Q6.31 0.7 6.74 1.36Q7.17 2.01 7.19 2.93H5.2Q5.15 2.37 4.76 2.05Q4.36 1.73 3.71 1.73Q3.31 1.73 3 1.85Q2.69 1.97 2.51 2.19Q2.33 2.4 2.33 2.68Q2.33 2.93 2.48 3.1Q2.63 3.28 2.95 3.41Q3.27 3.54 3.77 3.64L4.56 3.8Q5.3 3.95 5.84 4.18Q6.38 4.4 6.72 4.71Q7.07 5.03 7.23 5.44Q7.4 5.85 7.4 6.37Q7.4 7.26 6.96 7.9Q6.52 8.54 5.7 8.88Q4.88 9.22 3.73 9.22ZM11.07 9.22Q10.09 9.22 9.33 8.81Q8.58 8.4 8.16 7.66Q7.74 6.92 7.74 5.92Q7.74 4.91 8.16 4.17Q8.58 3.43 9.33 3.01Q10.09 2.6 11.07 2.6Q12.07 2.6 12.82 3.01Q13.57 3.43 13.99 4.17Q14.4 4.91 14.4 5.92Q14.4 6.92 13.99 7.66Q13.57 8.4 12.82 8.81Q12.07 9.22 11.07 9.22ZM11.07 7.58Q11.44 7.58 11.72 7.39Q12 7.19 12.16 6.82Q12.32 6.45 12.32 5.92Q12.32 5.38 12.16 5.01Q12 4.64 11.72 4.44Q11.44 4.25 11.07 4.25Q10.72 4.25 10.43 4.44Q10.15 4.63 9.99 5.01Q9.83 5.38 9.83 5.92Q9.83 6.45 9.99 6.82Q10.15 7.19 10.43 7.39Q10.72 7.58 11.07 7.58ZM14.93 9.08V0.14H21.37V1.98H17.08V3.88H21.11V5.65H17.08V9.08ZM21.83 9.08V2.75H23.9V9.08ZM22.86 2.13Q22.36 2.13 22.04 1.83Q21.72 1.54 21.72 1.09Q21.72 0.63 22.04 0.34Q22.36 0.05 22.86 0.05Q23.36 0.05 23.68 0.34Q24 0.63 24 1.09Q24 1.54 23.68 1.84Q23.36 2.13 22.86 2.13Z'
const SCHWAB_PATH = 'M6.79 24Q4.91 24 3.11 23.5Q1.31 23.01 0 22.19L0.23 17.14H2.26L3.41 22.77L1.22 21.86L1.21 20.55Q2.24 21.2 3.08 21.63Q3.92 22.05 4.78 22.25Q5.64 22.45 6.72 22.45Q8.14 22.45 9.19 21.98Q10.24 21.5 10.82 20.59Q11.39 19.67 11.39 18.39Q11.39 17.3 10.95 16.55Q10.51 15.81 9.67 15.24Q8.82 14.67 7.6 14.16L6.28 13.56Q4.58 12.8 3.25 11.85Q1.92 10.91 1.17 9.59Q0.42 8.28 0.42 6.44Q0.42 4.44 1.41 3Q2.4 1.57 4.17 0.78Q5.94 0 8.24 0Q9.99 0 11.47 0.46Q12.95 0.93 14.06 1.73L13.85 6.51H11.84L10.66 1.13L12.92 2.08L12.94 3.56Q11.69 2.46 10.62 2Q9.54 1.55 8.22 1.55Q7.05 1.55 6.09 1.98Q5.13 2.41 4.56 3.26Q3.98 4.1 3.98 5.34Q3.98 6.41 4.45 7.19Q4.91 7.97 5.75 8.56Q6.58 9.15 7.71 9.65L9.09 10.25Q11.06 11.1 12.39 12.07Q13.72 13.03 14.39 14.28Q15.07 15.53 15.07 17.3Q15.07 19.31 14.09 20.82Q13.11 22.33 11.27 23.16Q9.43 24 6.79 24Z'
const EMPOWER_PATH = 'M11.49 24Q8.01 24 5.42 22.46Q2.84 20.92 1.42 18.21Q0 15.5 0 12.02Q0 8.51 1.44 5.8Q2.89 3.09 5.43 1.54Q7.97 0 11.27 0Q13.8 0 15.87 0.86Q17.95 1.73 19.44 3.32Q20.94 4.91 21.75 7.09Q22.56 9.26 22.56 11.89V13.62H2.29V9.53H19.48L16.59 10.5Q16.59 8.76 15.96 7.5Q15.32 6.24 14.17 5.56Q13.01 4.88 11.4 4.88Q9.82 4.88 8.66 5.56Q7.5 6.24 6.87 7.5Q6.23 8.76 6.23 10.5V13.29Q6.23 15.06 6.87 16.4Q7.51 17.73 8.73 18.46Q9.95 19.2 11.67 19.2Q12.93 19.2 13.9 18.83Q14.88 18.47 15.54 17.81Q16.19 17.15 16.48 16.27H22.34Q21.91 18.55 20.39 20.29Q18.87 22.02 16.57 23.01Q14.27 24 11.49 24Z'
const ALIGHT_PATH = 'M7.97 24Q5.65 24 3.86 23.24Q2.07 22.47 1.03 20.93Q0 19.4 0 17.1Q0 15.13 0.72 13.83Q1.45 12.52 2.7 11.73Q3.96 10.94 5.6 10.52Q7.23 10.11 9.03 9.94Q11.15 9.72 12.4 9.53Q13.66 9.34 14.2 8.96Q14.74 8.59 14.74 7.84V7.69Q14.74 6.84 14.29 6.19Q13.83 5.54 12.99 5.17Q12.15 4.8 10.96 4.8Q9.77 4.8 8.86 5.18Q7.95 5.55 7.43 6.23Q6.9 6.91 6.81 7.81H0.74Q0.9 5.41 2.16 3.66Q3.43 1.92 5.7 0.96Q7.98 0 11.15 0Q13.52 0 15.38 0.54Q17.24 1.08 18.52 2.11Q19.8 3.15 20.46 4.61Q21.12 6.08 21.12 7.93V23.61H14.81V20.35H14.72Q14.12 21.48 13.21 22.3Q12.31 23.12 11.02 23.56Q9.74 24 7.97 24ZM9.74 19.52Q11.3 19.52 12.43 18.95Q13.57 18.38 14.18 17.39Q14.79 16.41 14.79 15.16V12.84Q14.51 12.99 14.05 13.13Q13.59 13.27 12.97 13.4Q12.36 13.52 11.64 13.65Q10.92 13.77 10.14 13.89Q9.04 14.05 8.14 14.42Q7.24 14.78 6.71 15.38Q6.18 15.99 6.18 16.91Q6.18 17.73 6.62 18.32Q7.07 18.9 7.87 19.21Q8.67 19.52 9.74 19.52Z'
const MOHELA_PATH = 'M0 21.44V0H7.65L10.42 8.42Q10.65 9.18 10.96 10.29Q11.27 11.4 11.61 12.61Q11.94 13.83 12.22 14.93Q12.51 16.03 12.68 16.79H11.37Q11.55 16.03 11.83 14.93Q12.11 13.83 12.44 12.61Q12.77 11.4 13.08 10.29Q13.38 9.18 13.61 8.42L16.34 0H24V21.44H18.93V12.15Q18.93 11.43 18.96 10.36Q18.99 9.28 19.02 8.03Q19.06 6.78 19.09 5.5Q19.13 4.22 19.13 3.09H19.73Q19.41 4.27 19.06 5.56Q18.7 6.86 18.36 8.1Q18.02 9.34 17.72 10.39Q17.41 11.44 17.19 12.15L14.1 21.44H9.92L6.79 12.15Q6.57 11.44 6.25 10.39Q5.94 9.34 5.59 8.1Q5.24 6.86 4.88 5.56Q4.51 4.27 4.18 3.09H4.87Q4.88 4.22 4.91 5.5Q4.94 6.78 4.98 8.03Q5.02 9.28 5.05 10.36Q5.08 11.43 5.08 12.15V21.44Z'

export const LOGOS: Record<string, Logo> = {
  chase: glyph('siChase', [0, 0, 24, 24], 0.5, same('#117ACA')),
  amex: glyph('siAmericanexpress', [0, 0, 24, 24], 0.64, same('#2E77BC')),
  sofi: { title: 'SoFi', path: SOFI_PATH, box: [0, 0, 24, 9.22], scale: 0.6, bg: same('#00A2C7'), fg: white },
  wells: glyph('siWellsfargo', [0.269, 0, 23.462, 24], 0.62, same('#D71E28')),
  x: { ...glyph('siX', [0.258, 0, 23.484, 24], 0.42, ['#000000', '#FFFFFF'], ['#FFFFFF', '#000000']), title: 'X Money' },
  schwab: { title: 'Charles Schwab', path: SCHWAB_PATH, box: [0, 0, 15.07, 24], scale: 0.4, bg: same('#00A0DF'), fg: white },
  empower: { title: 'Empower', path: EMPOWER_PATH, box: [0, 0, 22.56, 24], scale: 0.34, bg: same('#002157'), fg: white },
  alight: { title: 'Alight', path: ALIGHT_PATH, box: [0, 0, 21.12, 24], scale: 0.34, bg: same('#FFF200'), fg: same('#0A2029') },
  mohela: { title: 'MOHELA', path: MOHELA_PATH, box: [0, 0, 24, 21.44], scale: 0.38, bg: same('#0775BC'), fg: white },
}
export const LOGO_IDS = Object.keys(LOGOS)

/** An account's logo: the one picked in Settings (`logo:<id>`), else its bank's when it has no symbol or color of its own. */
export function accountLogo(a: { bank: string | null; icon: string | null; color: string | null }): Logo | null {
  if (a.icon?.startsWith('logo:')) return LOGOS[a.icon.slice(5)] ?? null
  if (a.icon || a.color || !a.bank) return null
  return LOGOS[a.bank.toLowerCase()] ?? null
}
