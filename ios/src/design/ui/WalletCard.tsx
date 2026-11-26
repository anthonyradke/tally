// An account as a card, the way Wallet shows them: the real card's picture when one was added (Account, Card Image),
// otherwise a face made for it in its bank's colors, with the bank's logo, the account's name and last four digits,
// and its balance. Card proportions, continuous corners and a soft shadow, as Wallet draws them.
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useQuery } from '@tanstack/react-query'
import { api, type Account, type CardFace } from '@/lib/api'
import { formatCents } from '@/lib/money'
import { authHeaders, useServer } from '@/lib/server'
import { bankName, KIND_LOOK } from '../look'
import { DARK_INK, inkFor, luminance, rgbOf, shade, stableColor } from '../color'
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
    enabled: !face?.color && !face?.art, staleTime: Infinity, retry: false })
  const c = face?.color ?? q.data?.color ?? null
  return c && rgbOf(c) ? c : null
}

/** A card face's two gradient ends and its inks, chosen by contrast against the top-left color (where the bank's
 *  name sits). Without a known face or brand color, each bank gets its own steady color instead of one gray. */
export function cardFace(name: string, bank: string, color: string | null): { from: string; to: string; ink: string; ink2: string; light: boolean } {
  const known = KNOWN.find(([re]) => re.test(name))?.[1]
  const base = color ?? stableColor(bank || name)
  const [from, to] = known ?? [base, shade(base, luminance(base) < 0.05 ? 0.4 : 0.62)]
  const ink = inkFor(from)
  const light = ink === DARK_INK
  return { from, to, ink, ink2: light ? 'rgba(28,28,30,0.62)' : 'rgba(255,255,255,0.72)', light }
}

/** `title`: what the top strip says instead of the bank (a card behind others shows only that strip). */
export function WalletCard({ a, balance, width, style, compact, title }: {
  a: Account; balance: number; width: number; style?: StyleProp<ViewStyle>; compact?: boolean; title?: string
}) {
  const faces = useCardFaces().data
  const face = faces?.[String(a.id)]
  const color = useCardColor(a, face)
  const height = width / CARD_RATIO
  const { from, to, ink, ink2, light } = cardFace(a.name, face?.institution ?? a.bank ?? '', color)
  const id = `g${a.id}`
  return (
    // The shadow view has the card's color and shape, so iOS draws the shadow from its outline instead of rendering
    // each card offscreen to find it. Like Wallet, the shadow is a soft glow in the card's own color, which is what
    // lifts a card off a black background (a black shadow there is invisible).
    <View style={[{ width, height, borderRadius: 16, borderCurve: 'continuous', backgroundColor: from, shadowColor: color ?? from,
      shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }, style]}>
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
              <Logo account={a.id} symbol={a.bank || face?.institution ? KIND_LOOK[a.kind].symbol : 'person.fill'}
                color={light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.22)'} ink={ink} size={28} />
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
        {/* A picture of the real card keeps its printing clear: the balance sits where Wallet prints the last four
            digits (bottom left, the same place on every card), on frosted glass. */}
        {face?.art && !compact && (
          <BlurView intensity={40} tint="dark" style={{ position: 'absolute', left: space.m, bottom: space.m, borderRadius: 12, overflow: 'hidden',
            paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(0,0,0,0.25)' }}>
            <Txt v="subhead" weight="600" color="#FFFFFF" num>{formatCents(balance)}</Txt>
          </BlurView>
        )}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)' }} />
      </View>
    </View>
  )
}
