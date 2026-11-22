// Activity's bar for select mode: how many are picked and what they add up to, Select all, and the bulk actions
// (category, account, tag, delete with Undo).
import { View } from 'react-native'
import { router } from 'expo-router'
import type { SFSymbol } from 'expo-symbols'
import Animated, { Easing, SlideInDown, SlideOutDown } from 'react-native-reanimated'
import type { Txn } from '@/lib/api'
import { deleteTxns } from '@/lib/actions'
import { accountSide, selectedTotal } from '@/lib/feed'
import { formatCents } from '@/lib/money'
import { useTally } from '@/lib/tally'
import { radius, space, useTheme } from '@/theme'
import { Icon } from './Icon'
import { Tap } from './Tap'
import { Txt } from './Txt'

/** `matching`: every entry the filters match, loaded or not; Select all picks them all. */
export function SelectionBar({ chosen, matching, onAll, onDone }: { chosen: Txn[]; matching: number; onAll: (all: boolean) => void; onDone: () => void }) {
  const { c } = useTheme()
  const t = useTally()
  const n = chosen.length
  const all = n > 0 && n >= matching
  const ids = chosen.map((x) => x.id).join(',')
  const act = (fn: () => void) => () => { if (n) fn() }
  const total = selectedTotal(chosen, t.typeOf)
  return (
    <Animated.View entering={SlideInDown.duration(320).easing(Easing.bezier(0.23, 1, 0.32, 1))} exiting={SlideOutDown.duration(220)}
      style={{ position: 'absolute', left: space.l, right: space.l, bottom: 100, borderRadius: radius.panel, borderCurve: 'continuous', backgroundColor: c.panelRaised, padding: space.m, gap: space.s, boxShadow: '0 8px 30px rgba(0,0,0,0.18)' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.xs, minHeight: 24 }}>
        <Txt variant="sub" tone="label2" style={{ flex: 1 }} numberOfLines={1}>
          {n ? `${n} selected, ${total < 0 ? '+' : ''}${formatCents(Math.abs(total))}` : 'Tap entries to select them'}
        </Txt>
        {matching > 1 && (
          <Tap feedback="opacity" onPress={() => onAll(!all)} hitSlop={10}>
            <Txt variant="sub" style={{ fontWeight: '600' }}>{all ? 'Deselect all' : `Select all ${matching.toLocaleString('en-US')}`}</Txt>
          </Tap>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <BarBtn label="Category" sf="square.grid.2x2" md="category" disabled={!n}
          onPress={act(() => router.push({ pathname: '/pick', params: { kind: 'bulk-category', ids } }))} />
        <BarBtn label="Account" sf="building.columns" md="account_balance" disabled={!n}
          onPress={act(() => router.push({ pathname: '/pick', params: { kind: 'bulk-account', ids, side: accountSide(chosen, t.typeOf) } }))} />
        <BarBtn label="Tag" sf="number" md="tag" disabled={!n}
          onPress={act(() => router.push({ pathname: '/pick', params: { kind: 'bulk-tag', ids } }))} />
        <BarBtn label="Delete" sf="trash" md="delete" destructive disabled={!n} onPress={act(() => { deleteTxns(chosen); onDone() })} />
      </View>
    </Animated.View>
  )
}

function BarBtn({ label, sf, md, onPress, destructive, disabled }: { label: string; sf: SFSymbol; md: string; onPress: () => void; destructive?: boolean; disabled?: boolean }) {
  const { c } = useTheme()
  const color = destructive ? c.neg : c.label
  return (
    <Tap onPress={onPress} disabled={disabled} accessibilityLabel={label}
      style={{ flex: 1, height: 52, borderRadius: radius.input, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center', gap: 2, opacity: disabled ? 0.4 : 1 }}>
      <Icon sf={sf} md={md} size={17} color={color} />
      <Txt variant="foot" style={{ color }}>{label}</Txt>
    </Tap>
  )
}
