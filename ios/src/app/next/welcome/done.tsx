// Setup's last page: a checkmark that pops in, what Tally made, and the way in.
import { useEffect } from 'react'
import { View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { success } from '@/next/haptics'
import { space, usePalette } from '@/next/theme'
import { Button } from '@/next/ui/Button'
import { Row, Section } from '@/next/ui/List'
import { Symbol } from '@/next/ui/Symbol'
import { Txt } from '@/next/ui/Txt'

export default function Done() {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const { accounts = '0', added = '0', waiting = '0' } = useLocalSearchParams<{ accounts?: string; added?: string; waiting?: string }>()
  useEffect(() => { const t = setTimeout(success, 350); return () => clearTimeout(t) }, [])
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top + 80, paddingBottom: Math.max(insets.bottom, space.l), paddingHorizontal: space.l }}>
      <View style={{ flex: 1, alignItems: 'center', gap: space.l }}>
        <Animated.View entering={ZoomIn.delay(150).springify().damping(10).stiffness(160)}
          style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: p.green, alignItems: 'center', justifyContent: 'center' }}>
          <Symbol name="checkmark" size={46} color="#FFFFFF" weight="bold" />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(350).springify()} style={{ alignItems: 'center', gap: space.s }}>
          <Txt v="largeTitle" center>You’re All Set</Txt>
          <Txt v="body" tone="label2" center>Tally checks your banks every few hours from now on.</Txt>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(500).springify()} style={{ alignSelf: 'stretch', marginTop: space.l }}>
          <Section>
            <Row title="Accounts" value={accounts} />
            <Row title="Transactions Added" value={Number(added).toLocaleString()} />
            <Row title="To Look Over" value={Number(waiting).toLocaleString()} valueTone={Number(waiting) ? 'blue' : 'label2'} />
          </Section>
        </Animated.View>
      </View>
      <Button label="Get Started" onPress={() => { router.dismissAll(); if (Number(waiting)) setTimeout(() => router.push('/next/check-in'), 450) }} />
    </View>
  )
}
