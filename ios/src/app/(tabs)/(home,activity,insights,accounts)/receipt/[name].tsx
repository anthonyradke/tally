// A receipt photo, full width; pinch to zoom in on the small print. Fetched with the token, like logos.
import { ScrollView, useWindowDimensions } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import { api } from '@/lib/api'
import { authHeaders } from '@/lib/server'
import { usePalette } from '@/design/theme'

export default function Receipt() {
  const { name } = useLocalSearchParams<{ name: string }>()
  const p = usePalette()
  const { width, height } = useWindowDimensions()
  return (
    <>
      <Stack.Screen options={{ title: 'Receipt' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }} maximumZoomScale={4} minimumZoomScale={1}
        centerContent bouncesZoom showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
        <Image source={{ uri: api.receiptUrl(name), headers: authHeaders() }} cachePolicy="disk" contentFit="contain" transition={180}
          accessibilityLabel="Receipt" style={{ width, height: height * 0.78 }} />
      </ScrollView>
    </>
  )
}
