// Themes: Classic is the original black-and-white app; the rest each bring one vivid accent (buttons, the chart line,
// the tab bar, selected chips), a background washed in that hue, a soft glow of two colors at the top of each tab,
// and a brighter category ring. Pure data, so scripts/tab-icons.mjs can read the accents too.

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
  /** Two colors for the glow behind the top of each tab, or null for none. */
  glow: null as readonly [string, string] | null,
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
  glow: null,
}

export type Palette = typeof light

// Category identity ring. Classic keeps the retired web app's validated OKLCH ring (converted exactly); the vivid
// ring is the same eight hues at full chroma, close to Apple's system colors.
export const TINTS = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink', 'gray'] as const
export type Tint = (typeof TINTS)[number]
type Ring = Record<Tint, string>
const CLASSIC_RING: { light: Ring; dark: Ring } = {
  light: {
    red: '#FE8B82', orange: '#BE6438', amber: '#D5AC1B', green: '#267625', teal: '#24BCB0',
    blue: '#3175C4', violet: '#B691E1', pink: '#B8437B', gray: '#8E8E93',
  },
  dark: {
    red: '#E86156', orange: '#B13D0C', amber: '#C18434', green: '#2C713A', teal: '#11A6AA',
    blue: '#4672B1', violet: '#793EAB', pink: '#CD7190', gray: '#98989F',
  },
}
const VIVID_RING: { light: Ring; dark: Ring } = {
  light: {
    red: '#F2453D', orange: '#F57C1F', amber: '#E5A500', green: '#22B04F', teal: '#00B2A6',
    blue: '#1F7BF2', violet: '#8A5CF6', pink: '#EC3F8C', gray: '#8E8E93',
  },
  dark: {
    red: '#FF5A4F', orange: '#FF8A2B', amber: '#FFB21F', green: '#30C85E', teal: '#1CC9BD',
    blue: '#3D8BFF', violet: '#9D74FF', pink: '#FF5A9E', gray: '#98989F',
  },
}

export interface ThemeSpec {
  id: string
  name: string
  light: Palette
  dark: Palette
  ring: { light: Ring; dark: Ring }
}

const theme = (id: string, name: string, l: Partial<Palette>, d: Partial<Palette>): ThemeSpec =>
  ({ id, name, light: { ...light, ...l }, dark: { ...dark, ...d }, ring: VIVID_RING })

export const THEMES: ThemeSpec[] = [
  { id: 'classic', name: 'Classic', light, dark, ring: CLASSIC_RING },
  theme('aurora', 'Aurora',
    { ink: '#6A4DF4', bg: '#F5F3FF', fill: '#E9E5FB', fillStrong: '#DCD6F7', label2: '#6B6880', chartPrev: 'rgba(90,70,200,0.28)', glow: ['#8B6CFF', '#3D9BFF'] },
    { ink: '#A992FF', onInk: '#150A33', bg: '#08071A', panel: '#15132B', panelRaised: '#201D3B', fill: '#221F3D', fillStrong: '#2E2A4F',
      label2: '#A29FBE', label3: '#625E80', sep: 'rgba(130,120,200,0.30)', chartPrev: 'rgba(200,190,255,0.30)', glow: ['#7B5CFF', '#2F8BFF'] }),
  theme('sunset', 'Sunset',
    { ink: '#EE4F2A', bg: '#FFF5F0', fill: '#F8E7DF', fillStrong: '#F0D8CC', label2: '#7A6660', chartPrev: 'rgba(200,90,60,0.28)', glow: ['#FF8A4C', '#FF4F9A'] },
    { ink: '#FF7A52', onInk: '#240A00', bg: '#110806', panel: '#221412', panelRaised: '#2E1C18', fill: '#2E1C18', fillStrong: '#3D2620',
      label2: '#B8A09A', label3: '#6E5650', sep: 'rgba(200,140,120,0.28)', chartPrev: 'rgba(255,210,195,0.30)', glow: ['#FF6A3D', '#FF2D87'] }),
  theme('ocean', 'Ocean',
    { ink: '#0084C7', bg: '#EFF6FA', fill: '#E0ECF3', fillStrong: '#CFE0EA', label2: '#5E6E78', chartPrev: 'rgba(40,110,150,0.28)', glow: ['#35D0EA', '#4D7CFF'] },
    { ink: '#38C8F0', onInk: '#00202B', bg: '#03090E', panel: '#0E1A22', panelRaised: '#16252F', fill: '#16252F', fillStrong: '#20323E',
      label2: '#93A7B3', label3: '#546773', sep: 'rgba(110,160,190,0.28)', chartPrev: 'rgba(190,230,250,0.30)', glow: ['#00C2E0', '#2F6BFF'] }),
  theme('citrus', 'Citrus',
    { ink: '#DB7300', bg: '#FFF9EC', fill: '#F6ECD6', fillStrong: '#EEDFC0', label2: '#76705F', chartPrev: 'rgba(170,120,30,0.28)', glow: ['#FFD04D', '#FF8A3D'] },
    { ink: '#FFC53D', onInk: '#231700', bg: '#0B0903', panel: '#1C1910', panelRaised: '#28241A', fill: '#28241A', fillStrong: '#363024',
      label2: '#B3AC96', label3: '#6D6755', sep: 'rgba(190,170,110,0.28)', chartPrev: 'rgba(255,240,200,0.30)', glow: ['#FFC53D', '#FF7A1A'] }),
  theme('blossom', 'Blossom',
    { ink: '#DC2A7E', bg: '#FFF3F8', fill: '#F8E3EC', fillStrong: '#F0D2DF', label2: '#7A6470', chartPrev: 'rgba(190,60,120,0.28)', glow: ['#FF6FB5', '#A77BFF'] },
    { ink: '#FF6BAE', onInk: '#2B0616', bg: '#0F050A', panel: '#21121A', panelRaised: '#2D1924', fill: '#2D1924', fillStrong: '#3C2230',
      label2: '#BA9DAC', label3: '#70566A', sep: 'rgba(200,120,160,0.28)', chartPrev: 'rgba(255,200,225,0.30)', glow: ['#FF4FA0', '#9D5CFF'] }),
]

export type ThemeId = string
export const themeById = (id: ThemeId) => THEMES.find((t) => t.id === id) ?? THEMES[0]
