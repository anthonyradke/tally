// The New design's foundation: Apple's own system colors and text styles, light and dark, so the app reads like the
// ones that ship on the phone. Everything visual in src/next and src/app/next comes from here.
import { useColorScheme, type TextStyle } from 'react-native'

/** Tally's own color, the way Notes is yellow and Health is pink: a deep emerald for everything you can tap and for
 *  money coming in. The system colors stay for categories and states. */
export const TINT: { light: string; dark: string } = { light: '#00875F', dark: '#30D398' }

const light = {
  label: '#000000', label2: 'rgba(60,60,67,0.6)', label3: 'rgba(60,60,67,0.3)', label4: 'rgba(60,60,67,0.18)',
  separator: 'rgba(60,60,67,0.29)', bg: '#F2F2F7', card: '#FFFFFF', card2: '#F2F2F7',
  fill: 'rgba(120,120,128,0.2)', fill2: 'rgba(120,120,128,0.16)', fill3: 'rgba(118,118,128,0.12)',
  blue: '#007AFF', green: '#34C759', red: '#FF3B30', orange: '#FF9500', yellow: '#FFCC00', pink: '#FF2D55',
  purple: '#AF52DE', indigo: '#5856D6', teal: '#30B0C7', mint: '#00C7BE', cyan: '#32ADE6', brown: '#A2845E',
  gray: '#8E8E93', monogram: ['#A6ABB5', '#858993'] as [string, string], onTint: '#FFFFFF', scrim: 'rgba(0,0,0,0.4)',
  tint: TINT.light,
}
const dark: typeof light = {
  label: '#FFFFFF', label2: 'rgba(235,235,245,0.6)', label3: 'rgba(235,235,245,0.3)', label4: 'rgba(235,235,245,0.16)',
  separator: 'rgba(84,84,88,0.6)', bg: '#000000', card: '#1C1C1E', card2: '#2C2C2E',
  fill: 'rgba(120,120,128,0.36)', fill2: 'rgba(120,120,128,0.32)', fill3: 'rgba(118,118,128,0.24)',
  blue: '#0A84FF', green: '#30D158', red: '#FF453A', orange: '#FF9F0A', yellow: '#FFD60A', pink: '#FF375F',
  purple: '#BF5AF2', indigo: '#5E5CE6', teal: '#40C8E0', mint: '#63E6E2', cyan: '#64D2FF', brown: '#AC8E68',
  gray: '#8E8E93', monogram: ['#6C7079', '#4E525A'] as [string, string], onTint: '#FFFFFF', scrim: 'rgba(0,0,0,0.6)',
  tint: TINT.dark,
}
export type Palette = typeof light
export type Hue = 'tint' | 'blue' | 'green' | 'red' | 'orange' | 'yellow' | 'pink' | 'purple' | 'indigo' | 'teal' | 'mint' | 'cyan' | 'brown' | 'gray'

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light
}

const t = (fontSize: number, lineHeight: number, fontWeight: TextStyle['fontWeight'], letterSpacing: number): TextStyle =>
  ({ fontSize, lineHeight, fontWeight, letterSpacing })

/** iOS text styles at the default size (Large). */
export const type = {
  hero: t(48, 56, '700', -0.6),
  largeTitle: t(34, 41, '700', 0.4),
  title1: t(28, 34, '700', 0.38),
  title2: t(22, 28, '700', -0.26),
  title3: t(20, 25, '600', -0.45),
  headline: t(17, 22, '600', -0.43),
  body: t(17, 22, '400', -0.43),
  callout: t(16, 21, '400', -0.31),
  subhead: t(15, 20, '400', -0.23),
  footnote: t(13, 18, '400', -0.08),
  caption: t(12, 16, '400', 0),
  caption2: t(11, 13, '400', 0.06),
} as const
export type TypeName = keyof typeof type

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 32 } as const
/** Corner radii: cards and grouped lists as iOS 26 draws them, controls fully round. */
export const radius = { card: 26, control: 999, field: 12 } as const

/** Springs as SwiftUI's defaults: critically damped, so things arrive and settle without overshooting. */
export const springs = {
  snappy: { duration: 280, dampingRatio: 1 },
  smooth: { duration: 420, dampingRatio: 1 },
} as const

/** A color with alpha, for tints behind symbols. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
