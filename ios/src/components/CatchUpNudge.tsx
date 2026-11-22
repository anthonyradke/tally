// A line at the top of Home when an account hasn't been caught up for a while (lib/caughtUp): the weekly pass
// through the bank's list is easy to let slide. An account never caught up is suggested once its newest entry is a
// week old, so Catch up gets found at all. Each account is measured against its own pace, and one that only moves a
// few times a month isn't suggested. Tapping opens Catch up on that account; the X stops it for that account, with
// Undo (Catch up's first page turns it back on).
import { useMemo } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import type { Bootstrap } from '@/lib/api'
import { useAllTxns } from '@/lib/balances'
import { catchable, touches } from '@/lib/catchup'
import { rhythmOf, staleAccounts, suggestCatchUp, useCaughtUp, type Rhythm } from '@/lib/caughtUp'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { radius, space, useTheme } from '@/theme'
import { AccountMark } from './AccountMark'
import { Icon } from './Icon'
import { Tap } from './Tap'
import { Txt } from './Txt'

export function CatchUpNudge({ b }: { b: Bootstrap }) {
  const { c } = useTheme()
  const { today } = useTally()
  const at = useCaughtUp((s) => s.at)
  const off = useCaughtUp((s) => s.off)
  const all = useAllTxns()
  const accounts = useMemo(() => catchable(b.accounts), [b.accounts])
  // Each account's newest entry so far (scheduled ones don't count), and how often it gets entries: the list is
  // oldest first.
  const { newest, rhythm } = useMemo(() => {
    const dates = new Map<number, string[]>(accounts.map((a) => [a.id, []]))
    for (const x of all.data?.items ?? []) {
      if (x.date > today) break
      for (const a of accounts) if (touches(x, a.id)) dates.get(a.id)!.push(x.date)
    }
    const newest: Record<string, string> = {}
    const rhythm: Record<string, Rhythm> = {}
    for (const [id, ds] of dates) {
      if (ds.length) newest[String(id)] = ds[ds.length - 1]
      rhythm[String(id)] = rhythmOf(ds, today)
    }
    return { newest, rhythm }
  }, [all.data, accounts, today])
  // Until the entries are in, the rhythm isn't known: a monthly account would show and then vanish.
  if (!all.data) return null
  const ids = accounts.map((a) => a.id).filter((id) => !off[String(id)])
  const stale = staleAccounts(at, ids, new Date(), newest, rhythm)
  if (!stale.length) return null
  const top = accounts.find((a) => a.id === stale[0].id)!
  const more = stale.length - 1
  const why = stale[0].never ? `Its newest entry is ${stale[0].days} days old` : `Last caught up ${stale[0].days} days ago`
  const open = () => { Haptics.selectionAsync().catch(() => {}); router.push({ pathname: '/catchup', params: { account: String(top.id) } }) }
  const hide = () => {
    Haptics.selectionAsync().catch(() => {})
    suggestCatchUp(top.id, false)
    toast({ text: `Home won't suggest catching up ${top.name}`, action: { label: 'Undo', run: () => suggestCatchUp(top.id, true) } })
  }
  return (
    <Tap onPress={open} accessibilityLabel={`${top.name}: ${why}. Catch up`}
      accessibilityActions={[{ name: 'activate' }, { name: 'hide', label: 'Not for this account' }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'hide' ? hide() : open())}
      style={{ marginBottom: space.l, padding: space.m, paddingRight: space.s, borderRadius: radius.panel, borderCurve: 'continuous',
        backgroundColor: c.panel, flexDirection: 'row', alignItems: 'center', gap: space.m }}>
      <AccountMark a={top} size={36} />
      <View style={{ flex: 1 }}>
        <Txt variant="headline" numberOfLines={2}>Time to catch up {top.name}</Txt>
        <Txt variant="sub" tone="label2" numberOfLines={2}>
          {`${why}${more ? `, and ${more} more ${more === 1 ? 'account' : 'accounts'}` : ''}`}
        </Txt>
      </View>
      <Tap feedback="opacity" onPress={hide} hitSlop={8} accessibilityLabel={`Not for ${top.name}`}
        style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
        <Icon sf="xmark" md="close" size={13} color={c.label3} weight="bold" />
      </Tap>
    </Tap>
  )
}
