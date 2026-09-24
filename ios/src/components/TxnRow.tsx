import { memo, useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { Link } from 'expo-router'
import { scheduleOnRN } from 'react-native-worklets'
import type { Account, Category, Txn } from '@/lib/api'
import { deleteTxns, openEntry } from '@/lib/actions'
import { isFuture } from '@/lib/dates'
import { useFresh } from '@/lib/motion'
import { rowAmount } from '@/lib/txn'
import type { MarkSpec } from '@/icons/merchants'
import { categoryVisual } from '@/icons/categories'
import { space, useTheme } from '@/theme'
import { EASE } from './ease'
import { Icon } from './Icon'
import { Mark } from './Mark'
import { Money } from './Money'
import { Tap } from './Tap'
import { Txt } from './Txt'

const web = process.env.EXPO_OS === 'web'

/** Which account a row is "about": where spending came from, where money landed, or From → To for transfers. */
function accountLine(t: Txn, c: Category, acct: Map<number, Account>): string {
  const f = t.from_id ? acct.get(t.from_id)?.name : undefined
  const to = t.to_id ? acct.get(t.to_id)?.name : undefined
  if (c.type === 'Money in') return to ?? ''
  if (c.type === 'Spending') return f ?? ''
  return f && to ? `${f} → ${to}` : (f ?? to ?? '')
}

export const TxnRow = memo(function TxnRow({ t, c, acct, mark, today, showDate }: {
  t: Txn; c: Category; acct: Map<number, Account>; mark: MarkSpec | null; today: string; showDate?: string
}) {
  const theme = useTheme()
  const v = categoryVisual(c)
  const amt = rowAmount(c.type, t.amount)
  const future = isFuture(t.date, today)
  const where = accountLine(t, c, acct)
  const fold = useFold(t.id, useFresh((s) => s.ids.has(t.id)))
  const row = (
        <Tap feedback="highlight" onPress={web ? () => openEntry(t.id) : undefined}
          accessibilityLabel={`${t.what}, ${c.name}, ${amt.sign === 'always' ? '+' : ''}${(amt.cents / 100).toFixed(2)} dollars${future ? ', scheduled' : ''}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m, opacity: future ? 0.55 : 1 }}>
          {mark ? <Mark kind="spec" spec={mark} /> : <Mark kind="glyph" sf={v.sf} md={v.md} tint={theme.tint(v.tint)} />}
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="row" numberOfLines={1}>{t.what || c.name}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Txt variant="sub" tone="label2" numberOfLines={1} style={{ flexShrink: 1 }}>
                {future ? `Scheduled, ${showDate ?? c.name}` : showDate ?? c.name}
              </Txt>
              {t.split_group && <Icon sf="square.split.2x1" md="call_split" size={11} color={theme.c.label2} />}
              {t.receipt && <Icon sf="paperclip" md="attach_file" size={11} color={theme.c.label2} />}
              {t.recurring_id && <Icon sf="repeat" md="repeat" size={11} color={theme.c.label2} />}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2, maxWidth: '42%' }}>
            <Money cents={amt.cents} sign={amt.sign} tone={amt.tone} muted={amt.muted} />
            {!!where && <Txt variant="sub" tone="label2" numberOfLines={1}>{where}</Txt>}
          </View>
        </Tap>
  )
  // The long-press menu is native iOS; on the web preview the row is a plain button.
  return (
    <Animated.View style={fold.outer}>
      <View onLayout={(e) => fold.measured(e.nativeEvent.layout.height)}>
        {web ? row : (
          <Link href={{ pathname: '/entry', params: { id: String(t.id) } }} asChild>
            <Link.Trigger>{row}</Link.Trigger>
            <Link.Menu>
              <Link.MenuAction title="Edit" icon="pencil" onPress={() => openEntry(t.id)} />
              <Link.MenuAction title="Duplicate to today" icon="plus.square.on.square" onPress={() => openEntry(t.id, 'duplicate')} />
              <Link.MenuAction title="Delete" icon="trash" destructive onPress={() => fold.close(() => deleteTxns([t]))} />
            </Link.Menu>
          </Link>
        )}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.c.ink }, fold.glow]} />
      </View>
    </Animated.View>
  )
})

/** A row that just arrived (saved, or back from Undo) unfolds from nothing and glows in the accent for a moment; a
 *  deleted row folds shut before it goes. Rows are recycled by the lists, so everything resets when the id changes. */
function useFold(id: number, fresh: boolean) {
  const reduce = useReducedMotion()
  const h = useSharedValue(fresh && !reduce ? 0 : -1) // -1: natural height
  const glow = useSharedValue(0)
  const natural = useSharedValue(0)
  const opening = useRef(false)
  const open = (px: number) => { h.set(0); h.set(withTiming(px, { duration: 320, easing: EASE }, (ok) => { if (ok) h.set(-1) })) }
  useEffect(() => {
    glow.set(0)
    if (!fresh) { opening.current = false; h.set(-1); return }
    glow.set(0.16)
    glow.set(withDelay(350, withTiming(0, { duration: 1500 })))
    if (reduce) return
    // Measured already (a recycled cell, or layout beat this effect): open now; otherwise open once it's measured.
    if (natural.get() > 0) open(natural.get())
    else { opening.current = true; h.set(0) }
  }, [id, fresh, reduce]) // eslint-disable-line react-hooks/exhaustive-deps
  const outer = useAnimatedStyle(() => {
    const v = h.get()
    return v < 0 ? { opacity: 1 } : { height: v, opacity: natural.get() ? Math.min(1, v / natural.get()) : 0, overflow: 'hidden' }
  })
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get() }))
  return {
    outer,
    glow: glowStyle,
    measured: (px: number) => {
      natural.set(px)
      if (!opening.current) return
      opening.current = false
      open(px)
    },
    close: (then: () => Promise<boolean>) => {
      const full = natural.get()
      if (reduce || !full) { then(); return }
      const reopen = (ok: boolean) => { if (!ok) h.set(withTiming(full, { duration: 220 }, () => h.set(-1))) }
      const go = () => { then().then(reopen) }
      h.set(full)
      h.set(withTiming(0, { duration: 240, easing: EASE }, (ok) => { if (ok) scheduleOnRN(go) }))
    },
  }
}
