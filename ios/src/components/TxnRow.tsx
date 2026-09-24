import { memo, useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated'
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable'
import { Link, router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import type { SFSymbol } from 'expo-symbols'
import { scheduleOnRN } from 'react-native-worklets'
import type { Account, Category, Txn } from '@/lib/api'
import { deleteTxns, openEntry } from '@/lib/actions'
import { isFuture } from '@/lib/dates'
import { useFresh } from '@/lib/motion'
import { rowAmount } from '@/lib/txn'
import type { MarkSpec } from '@/icons/merchants'
import { categoryVisual } from '@/icons/categories'
import { radius, space, useTheme } from '@/theme'
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
          // Rounded so the long-press lift (and the press highlight) match the panel's shape instead of a hard rectangle.
          accessibilityLabel={`${t.what}, ${c.name}, ${amt.sign === 'always' ? '+' : ''}${(amt.cents / 100).toFixed(2)} dollars${future ? ', scheduled' : ''}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m, opacity: future ? 0.55 : 1,
            backgroundColor: theme.c.panel, borderRadius: radius.input, borderCurve: 'continuous' }}>
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
  const remove = () => fold.close(() => deleteTxns([t]))
  const recategorize = () => router.push({ pathname: '/pick', params: { kind: 'bulk-category', ids: String(t.id) } })
  const left: Action[] = [{ label: 'Duplicate', sf: 'plus.square.on.square', md: 'content_copy', color: '#0A84FF', run: () => openEntry(t.id, 'duplicate') }]
  const right: Action[] = [
    { label: 'Category', sf: 'square.grid.2x2', md: 'category', color: '#8E8E93', run: recategorize },
    { label: 'Edit', sf: 'pencil', md: 'edit', color: '#FF9F0A', run: () => openEntry(t.id) },
    { label: 'Delete', sf: 'trash', md: 'delete', color: '#FF3B30', run: remove },
  ]
  // A long swipe arms the edge action; letting go while armed runs it.
  const armed = useRef<'left' | 'right' | null>(null)
  const swipe = useRef<SwipeableMethods>(null)
  const onOpen = () => {
    const side = armed.current
    if (!side) return
    armed.current = null
    swipe.current?.close()
    if (side === 'left') left[0].run()
    else right[right.length - 1].run()
  }
  // Swipe like Mail: right for Duplicate; left for Category, Edit and Delete. The long-press menu is native iOS; on the
  // web preview the row is a plain button. The Link's own navigation is prevented and openEntry pushes instead (it
  // ignores a second push while the first is still opening).
  return (
    <Animated.View style={fold.outer}>
      <View onLayout={(e) => fold.measured(e.nativeEvent.layout.height)}>
        <Swipeable ref={swipe} friction={1.4} leftThreshold={40} rightThreshold={40} onSwipeableWillOpen={onOpen}
          renderLeftActions={(_, x, m) => <Actions x={x} m={m} side="left" actions={left} onArm={(on) => { armed.current = on ? 'left' : null }} />}
          renderRightActions={(_, x, m) => <Actions x={x} m={m} side="right" actions={right} onArm={(on) => { armed.current = on ? 'right' : null }} />}>
          {web ? row : (
            <Link href={{ pathname: '/entry', params: { id: String(t.id) } }} asChild onPress={(e) => { e.preventDefault(); openEntry(t.id) }}>
              <Link.Trigger>{row}</Link.Trigger>
              <Link.Menu>
                <Link.MenuAction title="Edit" icon="pencil" onPress={() => openEntry(t.id)} />
                <Link.MenuAction title="Duplicate to today" icon="plus.square.on.square" onPress={() => openEntry(t.id, 'duplicate')} />
                <Link.MenuAction title="Change category" icon="square.grid.2x2" onPress={recategorize} />
                <Link.MenuAction title="Delete" icon="trash" destructive onPress={remove} />
              </Link.Menu>
            </Link>
          )}
        </Swipeable>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.c.ink }, fold.glow]} />
      </View>
    </Animated.View>
  )
})

const ACTION_W = 74
const ARM = 110 // how far past the open buttons a swipe has to go to arm the edge action

interface Action { label: string; sf: SFSymbol; md: string; color: string; run: () => void }

/** The buttons behind a swiped row. They rest at 74 points each and stretch with the swipe; dragged well past them,
 *  the edge action (Delete, Duplicate) swallows the others with a tick. */
function Actions({ x, m, side, actions, onArm }: { x: SharedValue<number>; m: SwipeableMethods; side: 'left' | 'right'; actions: Action[]; onArm: (on: boolean) => void }) {
  const armed = useSharedValue(0)
  const rest = actions.length * ACTION_W
  const edge = side === 'right' ? actions.length - 1 : 0
  const arm = (on: boolean) => { onArm(on); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}) }
  useAnimatedReaction(() => Math.abs(x.get()) > rest + ARM, (on, was) => {
    if (was === null || on === was) return
    armed.set(withTiming(on ? 1 : 0, { duration: 160 }))
    scheduleOnRN(arm, on)
  })
  // The strip is anchored to the row's edge and as wide as the swipe, so an overshoot stretches it instead of
  // leaving a gap.
  const strip = useAnimatedStyle(() => ({ width: Math.max(Math.abs(x.get()), rest) }))
  return (
    <View style={{ width: rest }}>
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, flexDirection: 'row' }, side === 'right' ? { right: 0 } : { left: 0 }, strip]}>
        {actions.map((a, i) => <ActionBtn key={a.label} a={a} n={actions.length} edge={i === edge} armed={armed} onPress={() => { m.close(); a.run() }} />)}
      </Animated.View>
    </View>
  )
}

function ActionBtn({ a, n, edge, armed, onPress }: { a: Action; n: number; edge: boolean; armed: SharedValue<number>; onPress: () => void }) {
  const style = useAnimatedStyle(() => ({ flex: edge ? 1 + armed.get() * n * 4 : 1 - armed.get() }))
  return (
    <Animated.View style={[{ minWidth: 0, overflow: 'hidden', backgroundColor: a.color }, style]}>
      <Tap feedback="opacity" onPress={onPress} accessibilityLabel={a.label}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: ACTION_W - 16 }}>
        <Icon sf={a.sf} md={a.md} size={18} color="#FFFFFF" />
        <Txt variant="foot" numberOfLines={1} style={{ color: '#FFFFFF', fontWeight: '600' }}>{a.label}</Txt>
      </Tap>
    </Animated.View>
  )
}

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
