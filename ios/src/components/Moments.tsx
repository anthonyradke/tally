// The top of Home, now and then: a payday banner when money lands today, or a milestone when net worth passes a round
// number on the way up. Each shows once (remembered on the phone), with confetti and the till's ring. Tap to put away.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import type { Bootstrap } from '@/lib/api'
import { useTransactions } from '@/lib/data'
import { formatCents } from '@/lib/money'
import { milestone, paydays } from '@/lib/moments'
import { monthsNow } from '@/lib/months'
import { play } from '@/lib/sound'
import { useTally } from '@/lib/tally'
import { radius, space, useTheme } from '@/theme'
import { Confetti } from './Confetti'
import { Icon } from './Icon'
import { Tap } from './Tap'
import { Txt } from './Txt'

const PAID = 'tally.moments.paid'
const WORTH = 'tally.moments.worth'

export function Moments({ b }: { b: Bootstrap }) {
  const { c } = useTheme()
  const t = useTally()
  const today = useTransactions({ start: b.today, end: b.today, limit: 200 })
  const [text, setText] = useState<string | null>(null)
  const [fire, setFire] = useState(0)
  const worth = monthsNow(b).cur?.net_worth
  useEffect(() => {
    if (!today.data || worth == null) return
    let live = true
    ;(async () => {
      const seen: number[] = JSON.parse((await AsyncStorage.getItem(PAID)) ?? '[]')
      const last = await AsyncStorage.getItem(WORTH)
      await AsyncStorage.setItem(WORTH, String(worth))
      const paid = paydays(b, today.data.items, seen)
      const passed = milestone(last == null ? null : Number(last), worth)
      let say: string | null = null
      if (paid.length) {
        const top = paid.reduce((x, y) => (y.amount > x.amount ? y : x))
        const where = top.to_id ? t.acct.get(top.to_id)?.name : null
        say = `Payday! ${formatCents(top.amount, { cents: top.amount % 100 !== 0 })} landed${where ? ` in ${where}` : ''}.`
        await AsyncStorage.setItem(PAID, JSON.stringify([...seen, ...paid.map((x) => x.id)].slice(-100)))
      } else if (passed != null) {
        say = passed === 0 ? 'Net worth is out of the red.' : passed > 0 ? `Net worth passed ${formatCents(passed, { cents: false })}.` : `Net worth climbed past ${formatCents(passed, { cents: false })}.`
      }
      if (!live || !say) return
      setText(say)
      setFire((n) => n + 1)
      play('income')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    })().catch(() => {})
    return () => { live = false }
  }, [today.data, worth]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!text) return null
  return (
    <View style={{ zIndex: 10, marginBottom: space.l }}>
      <Animated.View entering={ZoomIn.springify().damping(14)} exiting={FadeOut.duration(200)}>
        <Tap onPress={() => setText(null)} accessibilityLabel={`${text} Dismiss`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.l, minHeight: 44, borderRadius: radius.pill, backgroundColor: c.pos }}>
          <Icon sf="sparkles" md="auto_awesome" size={15} color="#FFFFFF" />
          <Txt variant="callout" num style={{ color: '#FFFFFF', fontWeight: '700', flex: 1 }}>{text}</Txt>
          <Icon sf="xmark" md="close" size={11} color="rgba(255,255,255,0.8)" weight="bold" />
        </Tap>
      </Animated.View>
      <Confetti fire={fire} origin={{ x: 0.5, y: 0.5 }} />
    </View>
  )
}
