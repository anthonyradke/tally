// A line at the top of Home when an account hasn't been caught up for a while (lib/caughtUp): the weekly pass
// through the bank's list is easy to let slide. Tapping opens Catch up on that account.
import { View } from 'react-native'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import type { Bootstrap } from '@/lib/api'
import { catchable } from '@/lib/catchup'
import { staleAccounts, useCaughtUp } from '@/lib/caughtUp'
import { radius, space, useTheme } from '@/theme'
import { AccountMark } from './AccountMark'
import { Icon } from './Icon'
import { Tap } from './Tap'
import { Txt } from './Txt'

export function CatchUpNudge({ b }: { b: Bootstrap }) {
  const { c } = useTheme()
  const at = useCaughtUp((s) => s.at)
  const accounts = catchable(b.accounts)
  const stale = staleAccounts(at, accounts.map((a) => a.id))
  if (!stale.length) return null
  const top = accounts.find((a) => a.id === stale[0].id)!
  const more = stale.length - 1
  return (
    <Tap onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push({ pathname: '/catchup', params: { account: String(top.id) } }) }}
      accessibilityLabel={`${top.name} was last caught up ${stale[0].days} days ago. Catch up`}
      style={{ marginBottom: space.l, padding: space.m, paddingRight: space.l, borderRadius: radius.panel, borderCurve: 'continuous',
        backgroundColor: c.panel, flexDirection: 'row', alignItems: 'center', gap: space.m }}>
      <AccountMark a={top} size={36} />
      <View style={{ flex: 1 }}>
        <Txt variant="headline" numberOfLines={1}>Time to catch up {top.name}</Txt>
        <Txt variant="sub" tone="label2" numberOfLines={1}>
          {`Last caught up ${stale[0].days} days ago${more ? `, and ${more} more ${more === 1 ? 'account' : 'accounts'}` : ''}`}
        </Txt>
      </View>
      <Icon sf="chevron.right" md="chevron_right" size={13} color={c.label3} weight="bold" />
    </Tap>
  )
}
