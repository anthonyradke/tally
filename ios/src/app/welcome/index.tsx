// The first thing a new ledger shows: what Tally does, in three lines, the way Apple's own apps say hello.
import { ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { SFSymbol } from 'expo-symbols'
import { leaveWelcome, useLeaveIfSetUp } from '@/design/setup'
import { rise } from '@/design/motion'
import { space, usePalette } from '@/design/theme'
import { AppMark } from '@/design/ui/AppMark'
import { Button } from '@/design/ui/Button'
import { SF } from '@/design/ui/SF'
import { Txt } from '@/design/ui/Txt'

const FEATURES: [SFSymbol, string, string][] = [
  ['building.columns.fill', 'Connect Your Banks', 'Transactions come in on their own.'],
  ['wand.and.stars', 'Sorted Automatically', 'Tally files what it recognizes and asks about the rest.'],
  ['chart.bar.fill', 'See Where It Goes', 'Spending, balances and net worth in one place.'],
]
const enter = (i: number) => rise(100 + i * 90)

export default function Welcome() {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  useLeaveIfSetUp()
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, space.l) }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.xxl, paddingTop: 72, gap: 44 }}>
        <Animated.View entering={enter(0)} style={{ alignItems: 'center', gap: space.l }}>
          <AppMark size={92} />
          <Txt v="largeTitle" center style={{ fontSize: 38, lineHeight: 44 }}>Welcome to Tally</Txt>
        </Animated.View>
        <View style={{ gap: 28 }}>
          {FEATURES.map(([icon, title, body], i) => (
            <Animated.View key={title} entering={enter(i + 1)} style={{ flexDirection: 'row', gap: space.l, alignItems: 'center' }}>
              <View style={{ width: 44, alignItems: 'center' }}><SF name={icon} size={30} color={p.tint} weight="regular" /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="headline">{title}</Txt>
                <Txt v="subhead" tone="label2">{body}</Txt>
              </View>
            </Animated.View>
          ))}
        </View>
      </ScrollView>
      <Animated.View entering={enter(5)} style={{ paddingHorizontal: space.xl, gap: space.l, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'center', paddingHorizontal: space.l }}>
          <SF name="lock.fill" size={13} color={p.label2} />
          <Txt v="footnote" tone="label2" center>Tally never sees your bank password.</Txt>
        </View>
        <View style={{ alignSelf: 'stretch', gap: space.s }}>
          <Button label="Continue" onPress={() => router.push('/welcome/connect')} />
          {/* Tally opens without banks; setup comes back on the next launch and stays in Settings until it's done. */}
          <Button label="Not Now" kind="plain" onPress={leaveWelcome} />
        </View>
      </Animated.View>
    </View>
  )
}
