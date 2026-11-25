// Setup's last page: a checkmark that draws itself, what Tally made, and the way in.
import { View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { leaveWelcome } from '@/next/setup'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { rise } from '@/next/motion'
import { space, usePalette } from '@/next/theme'
import { Checkmark } from '@/next/ui/Checkmark'
import { Button } from '@/next/ui/Button'
import { Row, Section } from '@/next/ui/List'
import { Txt } from '@/next/ui/Txt'

export default function Done() {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const { accounts = '0', added = '0', waiting = '0' } = useLocalSearchParams<{ accounts?: string; added?: string; waiting?: string }>()
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top + 80, paddingBottom: Math.max(insets.bottom, space.l), paddingHorizontal: space.l }}>
      <View style={{ flex: 1, alignItems: 'center', gap: space.l }}>
        <Checkmark color={p.green} />
        <Animated.View entering={rise(700)} style={{ alignItems: 'center', gap: space.s }}>
          <Txt v="largeTitle" center>You’re All Set</Txt>
          <Txt v="body" tone="label2" center>Your accounts stay up to date on their own.</Txt>
        </Animated.View>
        <Animated.View entering={rise(820)} style={{ alignSelf: 'stretch', marginTop: space.l }}>
          <Section>
            <Row title="Accounts" value={accounts} />
            <Row title="Transactions Added" value={Number(added).toLocaleString()} />
            <Row title="To Review" value={Number(waiting).toLocaleString()} valueTone={Number(waiting) ? 'blue' : 'label2'} />
          </Section>
        </Animated.View>
      </View>
      <Button label="Get Started" onPress={() => { leaveWelcome(); if (Number(waiting)) setTimeout(() => router.push('/next/check-in'), 450) }} />
    </View>
  )
}
