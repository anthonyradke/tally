import { View } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from '@/theme'

const H = 640
const LIFT = 380 // how far above the content it starts, so it sits behind the large title and the status bar

/** The theme's glow: two soft pools of color behind the top of a tab, which scroll away with the page. Place it as the
 *  first child of the scroll content. Classic has none. */
export function Glow() {
  const { c, dark } = useTheme()
  if (!c.glow) return null
  const [a, b] = c.glow
  const o = dark ? 0.42 : 0.3
  return (
    // The wrapper spans the full width: a percentage width on the Svg itself resolves against the parent's padded
    // content box, which left a strip on the right uncovered.
    <View pointerEvents="none" style={{ position: 'absolute', top: -LIFT, left: 0, right: 0, height: H }}>
    <Svg width="100%" height="100%">
      <Defs>
        <RadialGradient id="glowA" cx="12%" cy="48%" rx="80%" ry="50%">
          <Stop offset="0" stopColor={a} stopOpacity={o} />
          <Stop offset="1" stopColor={a} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="glowB" cx="92%" cy="40%" rx="75%" ry="45%">
          <Stop offset="0" stopColor={b} stopOpacity={o * 0.9} />
          <Stop offset="1" stopColor={b} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#glowA)" />
      <Rect width="100%" height="100%" fill="url(#glowB)" />
    </Svg>
    </View>
  )
}
