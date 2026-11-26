import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native'
import type { SFSymbol } from 'expo-symbols'
import { warning } from '../haptics'
import { radius, space, usePalette } from '../theme'
import { Press } from './Press'
import { SF } from './SF'
import { Txt } from './Txt'

/** A capsule button. `filled`: the one primary action on a screen; `tinted`: secondary; `plain`: text only.
 *  `disabled` dims it; a tap on it then runs `onDisabledPress` (by default a warning haptic, the refusal iOS gives). */
export function Button({ label, onPress, kind = 'filled', symbol, disabled, busy, destructive, style, onDisabledPress = warning }: {
  label: string; onPress: () => void; kind?: 'filled' | 'tinted' | 'plain'; symbol?: SFSymbol; disabled?: boolean; busy?: boolean
  destructive?: boolean; style?: StyleProp<ViewStyle>; onDisabledPress?: () => void
}) {
  const p = usePalette()
  const hue = destructive ? p.red : p.tint
  const bg = kind === 'filled' ? (destructive ? p.red : p.tintFill) : kind === 'tinted' ? p.fill3 : 'transparent'
  const fg = kind === 'filled' ? p.onTint : hue
  return (
    <Press disabled={disabled || busy} onDisabledPress={busy ? undefined : onDisabledPress} onPress={onPress}
      accessibilityLabel={label} accessibilityState={{ busy: !!busy }} style={[style, { opacity: disabled ? 0.35 : 1 }]}>
      <View style={{ height: 52, borderRadius: radius.control, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s, paddingHorizontal: space.xl }}>
        {busy ? <ActivityIndicator color={fg} /> : (
          <>
            {symbol && <SF name={symbol} size={17} color={fg} weight="semibold" />}
            <Txt v="headline" color={fg}>{label}</Txt>
          </>
        )}
      </View>
    </Press>
  )
}
