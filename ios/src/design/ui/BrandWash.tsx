// A soft wash of a brand's color behind the top of a page, fading into the background, the way Apple Card colors a
// purchase by its merchant. The page scrolls over it; nothing shows when the brand has no color.
import { useId } from 'react'
import { StyleSheet, useColorScheme, useWindowDimensions } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useServer } from '@/lib/server'
import { rgbOf, washable } from '../color'

/** The brand color for a wash, or null when there's none worth showing: the server's `wash` says so when it sends
 *  it; otherwise near-black, near-white and gray colors (a black logo's) are left out, since they only smudge. */
export function useBrandColor(name: string | undefined, on = true) {
  const server = useServer((s) => s.url)
  const q = useQuery({ queryKey: ['logo-color', server, 'name', (name ?? '').toLowerCase()], queryFn: () => api.logoColor({ name }),
    enabled: on && !!name?.trim(), staleTime: Infinity, retry: false })
  const c = q.data?.color ?? null
  const wash = q.data?.wash
  return c && (wash === undefined ? washable(c) : wash && !!rgbOf(c)) ? c : null
}

export function BrandWash({ color, height = 440 }: { color: string | null; height?: number }) {
  const { width } = useWindowDimensions()
  const dark = useColorScheme() === 'dark'
  const id = `wash${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  if (!color) return null
  return (
    <Animated.View entering={FadeIn.duration(400)} pointerEvents="none" style={[StyleSheet.absoluteFill, { height }]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={dark ? 0.5 : 0.32} />
            <Stop offset="0.55" stopColor={color} stopOpacity={dark ? 0.16 : 0.1} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  )
}
