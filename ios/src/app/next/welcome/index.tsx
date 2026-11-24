// The first thing a new ledger shows: what Tally does, in three lines, the way Apple's own apps say hello.
import { ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { SFSymbol } from 'expo-symbols'
import { space, usePalette } from '@/next/theme'
import { Button } from '@/next/ui/Button'
import { Symbol } from '@/next/ui/Symbol'
import { Txt } from '@/next/ui/Txt'

const FEATURES: [SFSymbol, string, string][] = [
  ['building.columns.fill', 'Your Banks, Connected', 'Link your accounts once. New transactions arrive on their own.'],
  ['wand.and.stars', 'Sorted for You', 'Tally files what it recognizes and only asks about what it doesn’t.'],
  ['chart.bar.fill', 'See Where It Goes', 'Spending, balances and net worth, always up to date.'],
]
const rise = (i: number) => FadeInDown.delay(120 + i * 110).springify().damping(18).stiffness(160)

export default function Welcome() {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, space.l) }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.xxl, paddingTop: 72, gap: 44 }}>
        <Animated.View entering={rise(0)} style={{ alignItems: 'center', gap: space.l }}>
          <View style={{ width: 92, height: 92, borderRadius: 22, borderCurve: 'continuous', backgroundColor: p.blue, alignItems: 'center', justifyContent: 'center' }}>
            <Symbol name="chart.bar.xaxis" size={46} color="#FFFFFF" weight="semibold" />
          </View>
          <Txt v="largeTitle" center style={{ fontSize: 38, lineHeight: 44 }}>Welcome to Tally</Txt>
        </Animated.View>
        <View style={{ gap: 28 }}>
          {FEATURES.map(([icon, title, body], i) => (
            <Animated.View key={title} entering={rise(i + 1)} style={{ flexDirection: 'row', gap: space.l, alignItems: 'center' }}>
              <View style={{ width: 44, alignItems: 'center' }}><Symbol name={icon} size={30} color={p.blue} weight="regular" /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="headline">{title}</Txt>
                <Txt v="subhead" tone="label2">{body}</Txt>
              </View>
            </Animated.View>
          ))}
        </View>
      </ScrollView>
      <Animated.View entering={rise(5)} style={{ paddingHorizontal: space.xl, gap: space.l, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'center', paddingHorizontal: space.l }}>
          <Symbol name="lock.fill" size={13} color={p.label2} />
          <Txt v="footnote" tone="label2" center>Your bank sign-in goes to Plaid. Tally never sees your password.</Txt>
        </View>
        <Button label="Continue" onPress={() => router.push('/next/welcome/connect')} style={{ alignSelf: 'stretch' }} />
      </Animated.View>
    </View>
  )
}
