import { Stack } from 'expo-router'
import { usePalette } from '@/design/theme'

export default function WelcomeStack() {
  const p = usePalette()
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }} />
}
