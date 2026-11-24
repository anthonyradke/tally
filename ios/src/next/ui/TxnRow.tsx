// An entry in a list: the place's logo (or the category's symbol), its name, the category and account, and the
// amount. Tap opens it; press and hold for a preview and a menu; swipe left to delete.
import { Pressable, View } from 'react-native'
import { Link, router } from 'expo-router'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import type { Txn } from '@/lib/api'
import { dayLabel } from '@/lib/dates'
import { deleteEntry, hideLogo } from '../actions'
import { thump } from '../haptics'
import { accountOf, useLedger } from '../ledger'
import { amountLook, categoryLook, wantsLogo } from '../look'
import { space, usePalette } from '../theme'
import { Logo } from './Logo'
import { Money } from './Money'
import { Press } from './Press'
import { Symbol } from './Symbol'
import { Txt } from './Txt'

const web = process.env.EXPO_OS === 'web'

export function TxnRow({ t, showDate, showAccount = true }: { t: Txn; showDate?: boolean; showAccount?: boolean }) {
  const p = usePalette()
  const L = useLedger()
  const c = L.cat.get(t.category_id)
  const type = c?.type
  const look = categoryLook(c)
  const a = L.acct.get(accountOf(t, type) ?? -1)
  const amt = amountLook(type, t.amount)
  const logo = wantsLogo(type)
  const sub = [c?.name, showDate ? dayLabel(t.date, L.today) : showAccount ? a?.name : undefined].filter(Boolean).join(' · ')
  const future = t.date > L.today
  const href = { pathname: '/next/txn/[id]' as const, params: { id: String(t.id) } }

  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: 10, minHeight: 64, backgroundColor: p.card, opacity: future ? 0.55 : 1 }}>
      <Logo name={logo ? t.what : undefined} symbol={look.symbol} color={p[look.hue]} size={42} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="body" numberOfLines={1}>{t.what || c?.name || 'Entry'}</Txt>
        <Txt v="subhead" tone="label2" numberOfLines={1}>{future ? `Scheduled · ${dayLabel(t.date, L.today)}` : sub}</Txt>
      </View>
      <Money cents={amt.cents} plus={amt.plus} tone={amt.tone} />
    </View>
  )
  const row = web
    ? <Press feel="highlight" haptic={false} onPress={() => router.push(href)}>{body}</Press>
    : (
      <Link href={href} asChild>
        <Link.Trigger>
          <Pressable>{body}</Pressable>
        </Link.Trigger>
        <Link.Preview />
        <Link.Menu>
          {[
            <Link.MenuAction key="edit" title="Edit" icon="pencil" onPress={() => router.push({ pathname: '/next/add', params: { id: String(t.id) } })} />,
            ...(logo && t.what ? [<Link.MenuAction key="logo" title="Wrong Logo" icon="photo.badge.exclamationmark" onPress={() => hideLogo(t.what)} />] : []),
            <Link.MenuAction key="del" title="Delete" icon="trash" destructive onPress={() => deleteEntry(t)} />,
          ]}
        </Link.Menu>
      </Link>
    )
  return (
    <ReanimatedSwipeable friction={1.6} rightThreshold={80} overshootRight={false}
      onSwipeableWillOpen={() => thump()}
      renderRightActions={() => (
        <Pressable onPress={() => deleteEntry(t)} accessibilityLabel={`Delete ${t.what}`}
          style={{ width: 88, backgroundColor: p.red, alignItems: 'center', justifyContent: 'center' }}>
          <Symbol name="trash.fill" size={20} color="#FFFFFF" />
        </Pressable>
      )}>
      {row}
    </ReanimatedSwipeable>
  )
}
