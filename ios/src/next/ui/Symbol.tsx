import { View } from 'react-native'
import { SymbolView, type SFSymbol, type SymbolWeight } from 'expo-symbols'

/** An SF Symbol. The web preview has none, so it draws a faint dot of the same size there. */
export function Symbol({ name, size = 17, color, weight = 'regular' }: { name: SFSymbol; size?: number; color: string; weight?: SymbolWeight }) {
  return (
    <SymbolView name={name} size={size} tintColor={color} weight={weight} resizeMode="scaleAspectFit"
      style={{ width: size, height: size }}
      fallback={<View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.5, height: size * 0.5, borderRadius: size, backgroundColor: color, opacity: 0.6 }} />
      </View>} />
  )
}
