// Design tokens. One accent (ink: the label color), one cool grey family (Apple's system greys), one semantic pair
// (pos/neg) for money direction only, and the category identity ring. Hex values mirror UIKit's system colors so they
// can feed Reanimated and SVG directly; both themes are defined together and nothing reads a color any other way.
import { useColorScheme } from 'react-native'

const light = {
  bg: '#F2F2F7',          // systemGroupedBackground
  panel: '#FFFFFF',       // secondarySystemGroupedBackground
  panelRaised: '#FFFFFF',
  fill: '#E9E9EE',        // tertiarySystemFill on grouped bg
  fillStrong: '#DCDCE1',
  sep: 'rgba(60,60,67,0.18)',
  label: '#000000',
  label2: '#6C6C70',      // secondaryLabel, 4.9:1 on bg
  label3: '#AEAEB2',      // tertiary: decorative only
  ink: '#000000',
  onInk: '#FFFFFF',
  pos: '#1F8A3B',
  neg: '#D70015',
  warn: '#B25000',
  chartPrev: 'rgba(60,60,67,0.30)',
  scrim: 'rgba(0,0,0,0.25)',
}

const dark: typeof light = {
  bg: '#000000',
  panel: '#1C1C1E',
  panelRaised: '#2C2C2E',
  fill: '#2C2C2E',
  fillStrong: '#3A3A3C',
  sep: 'rgba(84,84,88,0.55)',
  label: '#FFFFFF',
  label2: '#98989F',
  label3: '#636366',
  ink: '#FFFFFF',
  onInk: '#000000',
  pos: '#30D158',
  neg: '#FF6961',
  warn: '#FF9F0A',
  chartPrev: 'rgba(235,235,245,0.28)',
  scrim: 'rgba(0,0,0,0.5)',
}

export type Palette = typeof light

// Category identity ring, carried over from Tally's validated OKLCH ring (converted exactly); gray made cool to stay
// in the one grey family.
export const TINTS = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink', 'gray'] as const
export type Tint = (typeof TINTS)[number]
const TINT_LIGHT: Record<Tint, string> = {
  red: '#FE8B82', orange: '#BE6438', amber: '#D5AC1B', green: '#267625', teal: '#24BCB0',
  blue: '#3175C4', violet: '#B691E1', pink: '#B8437B', gray: '#8E8E93',
}
const TINT_DARK: Record<Tint, string> = {
  red: '#E86156', orange: '#B13D0C', amber: '#C18434', green: '#2C713A', teal: '#11A6AA',
  blue: '#4672B1', violet: '#793EAB', pink: '#CD7190', gray: '#98989F',
}
export const isTint = (t: string | null | undefined): t is Tint => !!t && (TINTS as readonly string[]).includes(t)

// Bank identity: each bank's own color.
const BANK: Record<string, [string, string]> = {
  chase: ['#1570D1', '#59A0F9'], amex: ['#008A48', '#43C07A'], sofi: ['#D35F00', '#F98942'],
  hsa: ['#8E8E93', '#98989F'], roth: ['#7D5FAD', '#AA8DDE'],
}

export function useTheme() {
  const dark_ = useColorScheme() === 'dark'
  const c = dark_ ? dark : light
  return {
    c,
    dark: dark_,
    tint: (t: Tint) => (dark_ ? TINT_DARK : TINT_LIGHT)[t],
    bank: (b: string) => (BANK[b] ?? BANK.hsa)[dark_ ? 1 : 0],
  }
}
export type Theme = ReturnType<typeof useTheme>

// Spacing rhythm: 4-pt base. Tight inside a panel (8-12), 28-32 between sections.
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, section: 32 } as const

// Shape lock: actions are pills, panels 24, inputs 12, marks are circles. Sheets are native.
export const radius = { input: 12, panel: 24, pill: 999 } as const

// Type ramp (iOS): one display size per screen. Money is tabular everywhere except the hero figure.
export const font = {
  hero: { fontSize: 44, fontWeight: '700' as const, letterSpacing: -1.2 },
  title: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.6 },
  title2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4 },
  headline: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.4 },
  body: { fontSize: 17, fontWeight: '400' as const, letterSpacing: -0.4 },
  row: { fontSize: 16, fontWeight: '500' as const, letterSpacing: -0.3 },
  callout: { fontSize: 15, fontWeight: '400' as const, letterSpacing: -0.2 },
  sub: { fontSize: 13, fontWeight: '500' as const, letterSpacing: -0.08 },
  foot: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0 },
}
export const tabular = { fontVariant: ['tabular-nums' as const] }
