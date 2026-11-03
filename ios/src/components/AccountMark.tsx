import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import type { SFSymbol } from 'expo-symbols'
import { accountLogo, type Logo } from '@/icons/banks'
import { GLYPHS, KIND_SYMBOL } from '@/icons/categories'
import type { Account } from '@/lib/api'
import { isTint, useTheme } from '@/theme'
import { Icon } from './Icon'
import { Mark } from './Mark'

type Look = Pick<Account, 'bank' | 'kind' | 'icon' | 'color'> & { apy?: number | null }

/** The color an account wears: its bank's, else violet for investments and grey for the rest. */
export const bankKey = (a: Pick<Account, 'bank' | 'kind'>) => a.bank ?? (a.kind === 'investment' ? 'roth' : 'hsa')

/** An account's symbol and color: its own if picked in Settings (a car for a car loan), else its kind's symbol on its
 *  bank's color. */
export function useAccountLook(a: Look) {
  const { bank, tint } = useTheme()
  const [sf, md] = a.icon && GLYPHS[a.icon] ? GLYPHS[a.icon] : KIND_SYMBOL[a.kind]
  return { sf, md, tint: isTint(a.color) ? tint(a.color) : bank(bankKey(a)) }
}

/** What a logo's corner badge says, so two accounts at one bank tell apart: a card, or savings that earn interest. */
const badgeFor = (a: Look): [SFSymbol, string] | null =>
  a.kind === 'card' ? ['creditcard.fill', 'credit_card'] : a.kind === 'cash' && a.apy ? ['percent', 'percent'] : null

export function AccountMark({ a, size }: { a: Look; size?: number }) {
  const logo = accountLogo(a)
  const v = useAccountLook(a)
  if (!logo) return <Mark kind="glyph" sf={v.sf} md={v.md} tint={v.tint} size={size} />
  return <LogoMark logo={logo} badge={badgeFor(a)} size={size ?? 40} />
}

export function LogoMark({ logo, badge, size }: { logo: Logo; badge?: [SFSymbol, string] | null; size: number }) {
  const t = useTheme()
  const i = t.dark ? 1 : 0
  const [x, y, w, h] = logo.box
  const k = (size * logo.scale) / Math.max(w, h) // the ink's longer side fills `scale` of the disc
  const b = Math.round(size * 0.42)
  return (
    <View accessibilityLabel={logo.title} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: logo.bg[i], alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={w * k} height={h * k} viewBox={`${x} ${y} ${w} ${h}`}><Path d={logo.path} fill={logo.fg[i]} /></Svg>
      {badge && (
        <View style={{ position: 'absolute', right: -size * 0.07, bottom: -size * 0.07, width: b, height: b, borderRadius: b / 2, backgroundColor: t.c.panel, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: b - 3, height: b - 3, borderRadius: (b - 3) / 2, backgroundColor: t.c.label2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon sf={badge[0]} md={badge[1]} size={b * 0.5} color={t.c.panel} weight="bold" />
          </View>
        </View>
      )}
    </View>
  )
}
