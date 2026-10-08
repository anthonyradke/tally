import { View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { radius, space } from '@/theme'
import { Icon } from './Icon'
import { Tap } from './Tap'
import { Txt } from './Txt'

/** Opens a month's story: a pill in the story's own colors, so it reads as a way into something bigger. */
export function StoryButton({ month, label }: { month: string; label: string }) {
  return (
    <Tap href={{ pathname: '/story', params: { month } }} accessibilityLabel={label}
      style={{ alignSelf: 'stretch', height: 44, borderRadius: radius.pill, overflow: 'hidden', borderCurve: 'continuous' }}>
      <Svg style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} width="100%" height="100%">
        <Defs>
          <LinearGradient id="storyPill" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#6A4DF4" />
            <Stop offset="0.55" stopColor="#E0457B" />
            <Stop offset="1" stopColor="#F57C1F" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#storyPill)" />
      </Svg>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s }}>
        <Icon sf="play.fill" md="play_arrow" size={13} color="#FFFFFF" />
        <Txt variant="headline" style={{ color: '#FFFFFF' }}>{label}</Txt>
      </View>
    </Tap>
  )
}
