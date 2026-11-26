// An account as a card, the way Wallet shows them: the real card's picture when one was added (Account, Card Image),
// otherwise a face made for it in its bank's colors, with the bank's logo, the account's name and last four digits,
// and its balance. Card proportions, continuous corners and a soft shadow, as Wallet draws them.
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { Image } from 'expo-image'
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useQuery } from '@tanstack/react-query'
import { api, type Account, type CardFace } from '@/lib/api'
import { formatCents } from '@/lib/money'
import { authHeaders, useServer } from '@/lib/server'
import { bankName, KIND_LOOK } from '../look'
import { space } from '../theme'
import { Logo } from './Logo'
import { Txt } from './Txt'

export const CARD_RATIO = 1.586 // ISO/IEC 7810 ID-1, every bank card's shape

/** Faces for cards people know by sight, when no picture was added: a nod to the real design in the same colors. */
const KNOWN: [RegExp, [string, string]][] = [
  [/freedom|ultimate rewards/i, ['#2F6FD0', '#0D2F6E']],
  [/sapphire/i, ['#1C4A78', '#0A1D33']],
  [/blue cash/i, ['#7EC3F0', '#2E78C4']],
  [/platinum/i, ['#E3E5E8', '#A9ADB3']],
  [/gold card|amex gold/i, ['#E4C27A', '#B48A3C']],
  [/x money/i, ['#2A2A2C', '#050505']],
  [/apple card/i, ['#FFFFFF', '#E9E9EC']],
]

export function useCardFaces() {
  const server = useServer((s) => s.url)
  return useQuery({ queryKey: ['cards', server], queryFn: api.cards, staleTime: 5 * 60_000 })
}

/** The card's own color: Plaid's for its bank, else the color of the bank's logo. */
function useCardColor(a: Account, face: CardFace | undefined) {
  const server = useServer((s) => s.url)
  const q = useQuery({ queryKey: ['logo-color', server, 'account', a.id], queryFn: () => api.logoColor({ account: a.id }),
    enabled: !face?.color && !face?.art, staleTime: Infinity })
  return face?.color ?? q.data?.color ?? null
}

const hex = (c: string) => c.replace('#', '')
const lum = (c: string) => {
  const n = parseInt(hex(c).slice(0, 6), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** A darker shade of a color, for the far end of its gradient. */
const shade = (c: string, k: number) => {
  const n = parseInt(hex(c).slice(0, 6), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`
}

/** `title`: what the top strip says instead of the bank (a card behind others shows only that strip). */
export function WalletCard({ a, balance, width, style, compact, title }: {
  a: Account; balance: number; width: number; style?: StyleProp<ViewStyle>; compact?: boolean; title?: string
}) {
  const faces = useCardFaces().data
  const face = faces?.[String(a.id)]
  const color = useCardColor(a, face)
  const height = width / CARD_RATIO
  const known = KNOWN.find(([re]) => re.test(a.name))?.[1]
  const [from, to] = known ?? (color ? [color, shade(color, lum(color) < 0.05 ? 0.4 : 0.62)] : ['#3A3A3C', '#1C1C1E'])
  const light = lum(from) > 0.45
  const ink = light ? '#1C1C1E' : '#FFFFFF'
  const ink2 = light ? 'rgba(28,28,30,0.62)' : 'rgba(255,255,255,0.72)'
  const id = `g${a.id}`
  return (
    <View style={[{ width, height, borderRadius: 16, borderCurve: 'continuous', shadowColor: '#000', shadowOpacity: 0.22,
      shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }, style]}>
      <View style={{ flex: 1, borderRadius: 16, borderCurve: 'continuous', overflow: 'hidden' }}>
        {face?.art ? (
          <Image source={{ uri: api.receiptUrl(face.art), headers: authHeaders() }} cachePolicy="disk" contentFit="cover"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} accessibilityLabel={`${a.name} card`} />
        ) : (
          <Svg width={width} height={height} style={{ position: 'absolute' }}>
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={from} />
                <Stop offset="1" stopColor={to} />
              </LinearGradient>
              {/* The sheen across a printed card, top left, like light on plastic. */}
              <RadialGradient id={`${id}s`} cx="0.15" cy="0" r="0.9">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={light ? 0.35 : 0.22} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect width={width} height={height} fill={`url(#${id})`} />
            <Rect width={width} height={height} fill={`url(#${id}s)`} />
          </Svg>
        )}
        {!face?.art && (
          <View style={{ flex: 1, padding: space.l, justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
              <Logo account={a.id} symbol={a.bank || face?.institution ? KIND_LOOK[a.kind].symbol : 'person.fill'} color="rgba(255,255,255,0.22)" size={28} />
              <Txt v="subhead" weight="600" color={ink} numberOfLines={1} style={{ flex: 1 }}>{title ?? face?.institution ?? bankName(a) ?? a.name}</Txt>
            </View>
            {!compact && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.m }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt v="headline" color={ink} numberOfLines={1}>{a.name}</Txt>
                  {face?.mask ? <Txt v="footnote" color={ink2} num>•••• {face.mask}</Txt> : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt v="caption" color={ink2}>Balance</Txt>
                  <Txt v="title3" weight="600" color={ink} num>{formatCents(balance)}</Txt>
                </View>
              </View>
            )}
          </View>
        )}
        {face?.art && !compact && (
          <View style={{ position: 'absolute', right: space.m, bottom: space.m, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(0,0,0,0.45)' }}>
            <Txt v="subhead" weight="600" color="#FFFFFF" num>{formatCents(balance)}</Txt>
          </View>
        )}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)' }} />
      </View>
    </View>
  )
}
