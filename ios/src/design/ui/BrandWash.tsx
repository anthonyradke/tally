// A soft wash of a brand's color behind the top of a page, fading into the background, the way Apple Card colors a
// purchase by its merchant. The page scrolls over it; nothing shows when the brand has no color.
import { StyleSheet, useColorScheme, useWindowDimensions } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useServer } from '@/lib/server'

export function useBrandColor(name: string | undefined, on = true) {
  const server = useServer((s) => s.url)
  const q = useQuery({ queryKey: ['logo-color', server, 'name', (name ?? '').toLowerCase()], queryFn: () => api.logoColor({ name }),
    enabled: on && !!name?.trim(), staleTime: Infinity, retry: false })
  return q.data?.color ?? null
}

export function BrandWash({ color, height = 440 }: { color: string | null; height?: number }) {
  const { width } = useWindowDimensions()
  const dark = useColorScheme() === 'dark'
  if (!color) return null
  return (
    <Animated.View entering={FadeIn.duration(400)} pointerEvents="none" style={[StyleSheet.absoluteFill, { height }]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="wash" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={dark ? 0.5 : 0.32} />
            <Stop offset="0.55" stopColor={color} stopOpacity={dark ? 0.16 : 0.1} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#wash)" />
      </Svg>
    </Animated.View>
  )
}
