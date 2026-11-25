// An entry in a list: the place's logo (or the category's symbol), its name, the category and account, and the
// amount. Tap opens it; press and hold for a preview and a menu; swipe left to delete. In one account's list
// (`account`), the amount reads like that account's statement and a move names the other side.
import { useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Link, router } from 'expo-router'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import type { Account, Txn } from '@/lib/api'
import { dayLabel } from '@/lib/dates'
import { deleteEntry, hideLogo } from '../actions'
import { thump } from '../haptics'
import { accountOf, signFrom, useLedger } from '../ledger'
import { amountLook, categoryLook, wantsLogo } from '../look'
import { space, usePalette } from '../theme'
import { Logo } from './Logo'
import { Money } from './Money'
import { SF } from './SF'
import { Txt } from './Txt'

const web = process.env.EXPO_OS === 'web'

export function TxnRow({ t, showDate, showAccount = true, account }: { t: Txn; showDate?: boolean; showAccount?: boolean; account?: Account }) {
  const p = usePalette()
  const L = useLedger()
  const [found, setFound] = useState(false)
  const busy = useRef(false)
  const c = L.cat.get(t.category_id)
  const type = c?.type
  const look = categoryLook(c)
  const amt = account ? signFrom(t, account) : amountLook(type, t.amount)
  const logo = wantsLogo(type)
  const future = t.date > L.today
  const from = t.from_id ? L.acct.get(t.from_id) : undefined
  const to = t.to_id ? L.acct.get(t.to_id) : undefined
  // A move between your own accounts names both sides ("Checking → Amex"), or on one of them, the other.
  const move = !logo && from && to
    ? account ? (from.id === account.id ? `To ${to.name}` : `From ${from.name}`) : `${from.name} → ${to.name}`
    : undefined
  const catName = c && c.name.toLowerCase() !== t.what.toLowerCase() ? c.name : undefined
  const where = account ? undefined : L.acct.get(accountOf(t, type) ?? -1)?.name
  const sub = [future ? 'Scheduled' : undefined, move ?? catName, showDate ? dayLabel(t.date, L.today) : !move && showAccount ? where : undefined]
    .filter(Boolean).join(' · ')
  const href = { pathname: '/txn/[id]' as const, params: { id: String(t.id) } }
  // One delete per row however fast the button is tapped again.
  const remove = async () => {
    if (busy.current) return
    busy.current = true
    try { await deleteEntry(t) } finally { busy.current = false }
  }

  // The card stays opaque under a dimmed (scheduled) row, so the red delete never shows through as it slides.
  const body = (pressed: boolean) => (
    <View style={{ backgroundColor: p.card }}>
      {pressed && <View style={[StyleSheet.absoluteFill, { backgroundColor: p.fill2 }]} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: 10, minHeight: 64, opacity: future ? 0.5 : 1 }}>
        <Logo name={logo ? t.what : undefined} symbol={look.symbol} color={p[look.hue]} size={42} onFound={found ? undefined : () => setFound(true)} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="body" numberOfLines={1}>{t.what || c?.name || 'Entry'}</Txt>
          {sub ? <Txt v="subhead" tone="label2" numberOfLines={1}>{sub}</Txt> : null}
        </View>
        <Money cents={amt.cents} plus={amt.plus} tone={amt.tone} />
      </View>
    </View>
  )
  const row = web
    ? <Pressable onPress={() => router.push(href)}>{({ pressed }) => body(pressed)}</Pressable>
    : (
      <Link href={href} asChild>
        <Link.Trigger>
          <Pressable unstable_pressDelay={70}>{({ pressed }) => body(pressed)}</Pressable>
        </Link.Trigger>
        <Link.Preview />
        <Link.Menu>
          {[
            <Link.MenuAction key="edit" title="Edit" icon="pencil" onPress={() => router.push({ pathname: '/add', params: { id: String(t.id) } })} />,
            ...(logo && t.what && found ? [<Link.MenuAction key="logo" title="Hide Logo" icon="eye.slash" onPress={() => hideLogo(t.what)} />] : []),
            <Link.MenuAction key="del" title="Delete" icon="trash" destructive onPress={remove} />,
          ]}
        </Link.Menu>
      </Link>
    )
  return (
    <ReanimatedSwipeable friction={1.6} rightThreshold={80} overshootRight={false}
      onSwipeableWillOpen={() => thump()}
      renderRightActions={() => (
        <Pressable onPress={remove} accessibilityLabel={`Delete ${t.what}`}
          style={{ width: 88, backgroundColor: p.red, alignItems: 'center', justifyContent: 'center' }}>
          <SF name="trash.fill" size={20} color="#FFFFFF" />
        </Pressable>
      )}>
      {row}
    </ReanimatedSwipeable>
  )
}
