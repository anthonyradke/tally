// A change under a figure: an arrow and the amount in green or red, then what it's since ("since October").
import { View } from 'react-native'
import { formatCents } from '@/lib/money'
import { useTheme } from '@/theme'
import { Icon } from './Icon'
import { Txt } from './Txt'

export function Delta({ cents, suffix }: { cents: number; suffix: string }) {
  const { c } = useTheme()
  const up = cents >= 0
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon sf={up ? 'arrow.up.right' : 'arrow.down.right'} md={up ? 'trending_up' : 'trending_down'} size={13} color={up ? c.pos : c.neg} weight="bold" />
      <Txt variant="callout" tone={up ? 'pos' : 'neg'} num style={{ fontWeight: '600' }}>{formatCents(Math.abs(cents), { cents: false })}</Txt>
      <Txt variant="callout" tone="label2">{suffix}</Txt>
    </View>
  )
}
