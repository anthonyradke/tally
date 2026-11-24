import { Stack } from 'expo-router'
import { usePalette } from '@/next/theme'

export default function WelcomeStack() {
  const p = usePalette()
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }} />
}
