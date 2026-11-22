// A line at the top of Home when an account hasn't been caught up for a while (lib/caughtUp): the weekly pass
// through the bank's list is easy to let slide. An account never caught up is suggested once its newest entry is a
// week old, so Catch up gets found at all. Tapping opens Catch up on that account.
import { useMemo } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import type { Bootstrap } from '@/lib/api'
import { useAllTxns } from '@/lib/balances'
import { catchable, touches } from '@/lib/catchup'
import { staleAccounts, useCaughtUp } from '@/lib/caughtUp'
import { useTally } from '@/lib/tally'
import { radius, space, useTheme } from '@/theme'
import { AccountMark } from './AccountMark'
import { Icon } from './Icon'
import { Tap } from './Tap'
import { Txt } from './Txt'

export function CatchUpNudge({ b }: { b: Bootstrap }) {
  const { c } = useTheme()
  const { today } = useTally()
  const at = useCaughtUp((s) => s.at)
  const all = useAllTxns()
  const accounts = useMemo(() => catchable(b.accounts), [b.accounts])
  // Each account's newest entry so far (scheduled ones don't count): the list is oldest first.
  const newest = useMemo(() => {
    const out: Record<string, string> = {}
    for (const x of all.data?.items ?? []) {
      if (x.date > today) break
      for (const a of accounts) if (touches(x, a.id)) out[String(a.id)] = x.date
    }
    return out
  }, [all.data, accounts, today])
  const stale = staleAccounts(at, accounts.map((a) => a.id), new Date(), all.data ? newest : {})
  if (!stale.length) return null
  const top = accounts.find((a) => a.id === stale[0].id)!
  const more = stale.length - 1
  const why = stale[0].never ? `Its newest entry is ${stale[0].days} days old` : `Last caught up ${stale[0].days} days ago`
  return (
    <Tap onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push({ pathname: '/catchup', params: { account: String(top.id) } }) }}
      accessibilityLabel={`${top.name}: ${why}. Catch up`}
      style={{ marginBottom: space.l, padding: space.m, paddingRight: space.l, borderRadius: radius.panel, borderCurve: 'continuous',
        backgroundColor: c.panel, flexDirection: 'row', alignItems: 'center', gap: space.m }}>
      <AccountMark a={top} size={36} />
      <View style={{ flex: 1 }}>
        <Txt variant="headline" numberOfLines={1}>Time to catch up {top.name}</Txt>
        <Txt variant="sub" tone="label2" numberOfLines={1}>
          {`${why}${more ? `, and ${more} more ${more === 1 ? 'account' : 'accounts'}` : ''}`}
        </Txt>
      </View>
      <Icon sf="chevron.right" md="chevron_right" size={13} color={c.label3} weight="bold" />
    </Tap>
  )
}
