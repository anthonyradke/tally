// The tab bar's + for each theme, drawn by scripts/tab-icons.mjs. Metro needs every require spelled out.
import type { ImageSourcePropType } from 'react-native'

export const ADD_ICON: Record<string, { light: ImageSourcePropType; dark: ImageSourcePropType }> = {
  classic: { light: require('../../assets/tab/add-classic-light.png'), dark: require('../../assets/tab/add-classic-dark.png') },
  aurora: { light: require('../../assets/tab/add-aurora-light.png'), dark: require('../../assets/tab/add-aurora-dark.png') },
  sunset: { light: require('../../assets/tab/add-sunset-light.png'), dark: require('../../assets/tab/add-sunset-dark.png') },
  ocean: { light: require('../../assets/tab/add-ocean-light.png'), dark: require('../../assets/tab/add-ocean-dark.png') },
  citrus: { light: require('../../assets/tab/add-citrus-light.png'), dark: require('../../assets/tab/add-citrus-dark.png') },
  blossom: { light: require('../../assets/tab/add-blossom-light.png'), dark: require('../../assets/tab/add-blossom-dark.png') },
}
