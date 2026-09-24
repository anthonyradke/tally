// Design tokens. One accent (ink: black and white in Classic, one vivid hue in the other themes), one grey family,
// one semantic pair (pos/neg) for money direction only, and the category identity ring. Hex values so they can feed
// Reanimated and SVG directly; palettes live in themes.ts and nothing reads a color any other way.
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { themeById, TINTS, type Palette, type ThemeId, type Tint } from './themes'

export { THEMES, TINTS, themeById, type Palette, type ThemeId, type Tint } from './themes'
export const isTint = (t: string | null | undefined): t is Tint => !!t && (TINTS as readonly string[]).includes(t)

// Bank identity: each bank's own color, whatever the theme.
const BANK: Record<string, [string, string]> = {
  chase: ['#1570D1', '#59A0F9'], amex: ['#008A48', '#43C07A'], sofi: ['#D35F00', '#F98942'],
  hsa: ['#8E8E93', '#98989F'], roth: ['#7D5FAD', '#AA8DDE'],
}

// The chosen theme is a setting on this phone, not on the server.
const KEY = 'tally.theme'
export const useThemeChoice = create<{ id: ThemeId; set: (id: ThemeId) => void }>((set) => ({
  id: 'classic',
  set: (id) => { set({ id }); AsyncStorage.setItem(KEY, id).catch(() => {}) },
}))
export async function loadTheme() {
  const saved = await AsyncStorage.getItem(KEY).catch(() => null)
  if (saved) useThemeChoice.setState({ id: themeById(saved).id })
}

export function useTheme() {
  const dark_ = useColorScheme() === 'dark'
  const spec = themeById(useThemeChoice((s) => s.id))
  const c: Palette = dark_ ? spec.dark : spec.light
  const ring = dark_ ? spec.ring.dark : spec.ring.light
  return {
    c,
    dark: dark_,
    theme: spec.id,
    tint: (t: Tint) => ring[t],
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
