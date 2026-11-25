// Color arithmetic for brand colors the app didn't choose: which ink reads on a card's face, a capsule deep enough
// for a white label, a steady color for a bank with no known one, and whether a logo's color is worth a wash.

/** [r, g, b] 0–255 from "#RGB", "#RRGGBB" or "#RRGGBBAA"; null when it isn't a hex color. */
export function rgbOf(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, '')
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6)
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const toHex = ([r, g, b]: [number, number, number]) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase()

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const c = rgbOf(hex)
  if (!c) return 0
  const [r, g, b] = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colors, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

export const DARK_INK = '#1C1C1E'
export const LIGHT_INK = '#FFFFFF'

/** The ink (white or near-black) that reads better on `bg`. */
export const inkFor = (bg: string): string => (contrast(bg, LIGHT_INK) >= contrast(bg, DARK_INK) ? LIGHT_INK : DARK_INK)

/** Each channel times `k` (below 1 darkens). */
export const shade = (hex: string, k: number): string => {
  const c = rgbOf(hex)
  return c ? toHex([c[0] * k, c[1] * k, c[2] * k]) : hex
}

/** `hex`, darkened just enough for white text on it to reach `min` contrast (3:1 by default, for bold labels). */
export function deepen(hex: string, min = 3): string {
  let c = hex
  for (let i = 0; i < 40 && contrast(c, LIGHT_INK) < min; i++) c = shade(c, 0.95)
  return c
}

/** HSL saturation and lightness, 0–1. */
export function satLight(hex: string): { s: number; l: number } {
  const c = rgbOf(hex)
  if (!c) return { s: 0, l: 0 }
  const [r, g, b] = c.map((v) => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1))
  return { s, l }
}

/** Whether a brand color makes a wash worth showing: not near black or near white, and not a gray (a black logo
 *  gave a gray smudge). */
export function washable(hex: string | null | undefined): boolean {
  if (!hex || !rgbOf(hex)) return false
  const { s, l } = satLight(hex)
  return l > 0.12 && l < 0.92 && s > 0.18
}

/** A steady color for a name with no brand color (a bank whose logo color is unknown): the same name always gets
 *  the same one, and different banks get different ones. Deep enough for white text. */
export function stableColor(name: string): string {
  const PALETTE = ['#1F5FAD', '#2E7D5B', '#7A3E9D', '#B5442C', '#246B8F', '#8A5A12', '#3B4A9C', '#9C2F5A', '#3D6E2A', '#5B5F66']
  let h = 2166136261
  for (const ch of name.trim().toLowerCase()) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619) }
  return PALETTE[(h >>> 0) % PALETTE.length]
}
