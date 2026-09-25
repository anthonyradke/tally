// The home screen icon: the app's own icon or one of the glowing t's in assets/app-icons/ (app.config.js registers them
// as alternate icons, named in PascalCase). The native module is loaded lazily so a build made before it existed, or
// the web build, just reports that icons can't change instead of crashing.
import Constants from 'expo-constants'
import { create } from 'zustand'

type Native = { supportsAlternateIcons: boolean; getAppIconName: () => string | null; setAlternateAppIcon: (n: string | null) => Promise<string | null> }
let native: Native | null = null
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { native = require('expo-alternate-app-icons') as Native } catch { native = null }

const isDev = Constants.expoConfig?.ios?.bundleIdentifier?.endsWith('.dev') ?? false
const THEMES = ['classic', 'aurora', 'sunset', 'ocean', 'citrus', 'blossom'] as const
const LABEL: Record<(typeof THEMES)[number] | 'dev', string> = {
  classic: 'Classic', aurora: 'Aurora', sunset: 'Sunset', ocean: 'Ocean', citrus: 'Citrus', blossom: 'Blossom', dev: 'Dev',
}
const SOURCES: Record<string, number> = {
  'classic-black': require('../../assets/app-icons/classic-black.png'), 'classic-white': require('../../assets/app-icons/classic-white.png'),
  'aurora-black': require('../../assets/app-icons/aurora-black.png'), 'aurora-white': require('../../assets/app-icons/aurora-white.png'),
  'sunset-black': require('../../assets/app-icons/sunset-black.png'), 'sunset-white': require('../../assets/app-icons/sunset-white.png'),
  'ocean-black': require('../../assets/app-icons/ocean-black.png'), 'ocean-white': require('../../assets/app-icons/ocean-white.png'),
  'citrus-black': require('../../assets/app-icons/citrus-black.png'), 'citrus-white': require('../../assets/app-icons/citrus-white.png'),
  'blossom-black': require('../../assets/app-icons/blossom-black.png'), 'blossom-white': require('../../assets/app-icons/blossom-white.png'),
  'dev-black': require('../../assets/app-icons/dev-black.png'), 'dev-white': require('../../assets/app-icons/dev-white.png'),
}
const ORIGINAL = require('../../assets/icon.png')

/** name is the native alternate icon name; null is the app's own icon. */
export type AppIcon = { name: string | null; label: string; source: number }

const pascal = (s: string) => s.replace(/(^|-)(\w)/g, (_, __, ch: string) => ch.toUpperCase())
const alt = (file: string, label: string): AppIcon => ({ name: pascal(file), label, source: SOURCES[file] })

export const DEFAULT_ICON: AppIcon = isDev ? { name: null, label: 'Dev', source: SOURCES['dev-black'] } : { name: null, label: 'Original', source: ORIGINAL }
export const ICON_GROUPS: { title: string; icons: AppIcon[] }[] = [
  { title: 'On black', icons: THEMES.map((t) => alt(`${t}-black`, LABEL[t])) },
  { title: 'On white', icons: [...THEMES.map((t) => alt(`${t}-white`, LABEL[t])), ...(isDev ? [alt('dev-white', LABEL.dev)] : [])] },
]

export const canChangeIcon = !!native?.supportsAlternateIcons

const current = () => { try { return native?.getAppIconName() ?? null } catch { return null } }

export const useAppIcon = create<{ name: string | null; set: (name: string | null) => Promise<void> }>((set) => ({
  name: current(),
  set: async (name) => {
    if (!native) return
    await native.setAlternateAppIcon(name)
    set({ name })
  },
}))

/** The label for an icon name, for the Settings row. */
export const iconLabel = (name: string | null) => {
  if (!name) return DEFAULT_ICON.label
  const hit = ICON_GROUPS.flatMap((g) => g.icons.map((i) => ({ ...i, g: g.title }))).find((i) => i.name === name)
  return hit ? `${hit.label}, ${hit.g.replace('On ', 'on ')}` : name
}
