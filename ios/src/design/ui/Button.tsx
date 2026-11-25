import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native'
import type { SFSymbol } from 'expo-symbols'
import { radius, space, usePalette } from '../theme'
import { Press } from './Press'
import { SF } from './SF'
import { Txt } from './Txt'

/** A capsule button. `filled`: the one primary action on a screen; `tinted`: secondary; `plain`: text only. */
export function Button({ label, onPress, kind = 'filled', symbol, disabled, busy, destructive, style }: {
  label: string; onPress: () => void; kind?: 'filled' | 'tinted' | 'plain'; symbol?: SFSymbol; disabled?: boolean; busy?: boolean
  destructive?: boolean; style?: StyleProp<ViewStyle>
}) {
  const p = usePalette()
  const hue = destructive ? p.red : p.tint
  const bg = kind === 'filled' ? hue : kind === 'tinted' ? p.fill3 : 'transparent'
  const fg = kind === 'filled' ? p.onTint : hue
  return (
    <Press disabled={disabled || busy} onPress={onPress} style={[{ opacity: disabled ? 0.35 : 1 }, style]}>
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
