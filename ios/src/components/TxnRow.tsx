import { memo, useEffect, useRef, useState, type ComponentProps } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated'
import { Link, router } from 'expo-router'
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
import { SwipeRow, type SwipeAction } from './SwipeRow'
import { Tap } from './Tap'
import { Txt } from './Txt'

const web = process.env.EXPO_OS === 'web'
const CHECK = 34 // the selection circle's column

/** Which account a row is "about": where spending came from, where money landed, or From → To for transfers. */
function accountLine(t: Txn, c: Category, acct: Map<number, Account>): string {
  const f = t.from_id ? acct.get(t.from_id)?.name : undefined
  const to = t.to_id ? acct.get(t.to_id)?.name : undefined
  if (c.type === 'Money in') return to ?? ''
  if (c.type === 'Spending') return f ?? ''
  return f && to ? `${f} → ${to}` : (f ?? to ?? '')
}

/** An entry. Tap opens it, long press has a menu, swipes have actions (see SwipeRow). In a list that can select,
 *  `sel` (0 → 1, shared by every row so the whole list animates at once without re-rendering) slides a check circle
 *  in, and taps toggle `selected` instead. */
export const TxnRow = memo(function TxnRow({ t, c, acct, mark, today, showDate, sel, selected, onSelect, padTop = 0, padBottom = 0 }: {
  t: Txn; c: Category; acct: Map<number, Account>; mark: MarkSpec | null; today: string; showDate?: string
  sel?: SharedValue<number>; selected?: boolean; onSelect?: (id: number) => void
  /** Extra padding for the first/last row of a group, inside the row so the highlight fills the group's corners. */
  padTop?: number; padBottom?: number
}) {
  const theme = useTheme()
  const v = categoryVisual(c)
  const amt = rowAmount(c.type, t.amount)
  const future = isFuture(t.date, today)
  const where = accountLine(t, c, acct)
  const fold = useFold(t.id, useFresh((s) => s.ids.has(t.id)))
  const [attempt, setAttempt] = useState(0) // bumped when a delete fails, so the swiped-away row comes back
  const selecting = !!onSelect
  const press = () => (onSelect ? onSelect(t.id) : openEntry(t.id))
  const remove = () => fold.close(async () => { const ok = await deleteTxns([t]); if (!ok) setAttempt((n) => n + 1); return ok })
  const recategorize = () => router.push({ pathname: '/pick', params: { kind: 'bulk-category', ids: String(t.id), current: String(t.category_id) } })
  const duplicate = () => openEntry(t.id, 'duplicate')
  const left: SwipeAction[] = [{ label: 'Duplicate', sf: 'plus.square.on.square', md: 'content_copy', color: '#0A84FF', run: duplicate }]
  const right: SwipeAction[] = [
    { label: 'Category', sf: 'square.grid.2x2', md: 'category', color: '#8E8E93', run: recategorize },
    { label: 'Edit', sf: 'pencil', md: 'edit', color: '#FF9F0A', run: () => openEntry(t.id) },
    { label: 'Delete', sf: 'trash', md: 'delete', color: '#FF3B30', run: remove, destructive: true },
  ]
  const check = useAnimatedStyle(() => {
    const k = sel ? sel.get() : 0
    return { width: k * CHECK, marginRight: -space.m * (1 - k), opacity: k, transform: [{ scale: 0.5 + k * 0.5 }] }
  })
  const row = (
    <LinkRow feedback="highlight" onPress={web ? press : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingTop: space.m + padTop, paddingBottom: space.m + padBottom, backgroundColor: theme.c.panel }}>
      {selecting && selected && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.c.fill }]} />}
      {sel && (
        <Animated.View style={[{ alignItems: 'flex-start', overflow: 'hidden' }, check]}>
          <Icon sf={selected ? 'checkmark.circle.fill' : 'circle'} md={selected ? 'check_circle' : 'radio_button_unchecked'} size={24}
            color={selected ? theme.c.ink : theme.c.label3} weight="regular" />
        </Animated.View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, flex: 1, opacity: future ? 0.55 : 1 }}>
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
      </View>
    </LinkRow>
  )
  // The long-press menu is native iOS (its lifted preview is rounded by our expo-router patch); on the web preview the
  // row is a plain button. The Link's own navigation is prevented and the row's press runs instead (open, or toggle
  // while selecting); openEntry ignores a second push while the first is still opening. The Link stays mounted while
  // selecting, so switching modes doesn't rebuild every row.
  return (
    <Animated.View style={fold.outer}>
      {/* VoiceOver can't see inside the native menu wrapper, so the row is one element out here: activate opens (or
          toggles), and the swipe and menu actions are its custom actions. */}
      <View onLayout={(e) => fold.measured(e.nativeEvent.layout.height)}
        accessible accessibilityRole="button"
        accessibilityLabel={`${t.what || c.name}, ${c.name}, ${amt.sign === 'always' ? '+' : ''}${(amt.cents / 100).toFixed(2)} dollars${where ? `, ${where}` : ''}${future ? ', scheduled' : ''}`}
        accessibilityState={selecting ? { selected: !!selected } : undefined}
        accessibilityActions={[{ name: 'activate' }, ...(selecting ? [] : [{ name: 'edit', label: 'Edit' }, { name: 'duplicate', label: 'Duplicate to today' }, { name: 'category', label: 'Change category' }, { name: 'delete', label: 'Delete' }])]}
        onAccessibilityAction={(e) => {
          const n = e.nativeEvent.actionName
          if (n === 'activate') press(); else if (n === 'edit') openEntry(t.id); else if (n === 'duplicate') duplicate(); else if (n === 'category') recategorize(); else if (n === 'delete') remove()
        }}>
        <SwipeRow left={left} right={right} enabled={!selecting} resetKey={`${t.id}:${attempt}`}>
          {web ? row : (
            <Link href={{ pathname: '/entry', params: { id: String(t.id) } }} asChild onPress={(e) => { e.preventDefault(); press() }}>
              <Link.Trigger>{row}</Link.Trigger>
              <Link.Menu>
                <Link.MenuAction title="Edit" icon="pencil" onPress={() => openEntry(t.id)} />
                <Link.MenuAction title="Duplicate to today" icon="plus.square.on.square" onPress={duplicate} />
                <Link.MenuAction title="Change category" icon="square.grid.2x2" onPress={recategorize} />
                <Link.MenuAction title="Delete" icon="trash" destructive onPress={remove} />
              </Link.Menu>
            </Link>
          )}
        </SwipeRow>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.c.ink }, fold.glow]} />
      </View>
    </Animated.View>
  )
})

/** The row's pressable. As a Link's child it's handed the Link's `href`, and Tap follows any href it gets, so a tap
 *  used to push the entry twice (two stacked editors, two X's to close). It drops the href; the row's own press
 *  opens the entry. */
function LinkRow({ href: _href, ...props }: ComponentProps<typeof Tap>) {
  return <Tap {...props} />
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
    // Every key is always returned: Reanimated keeps a key it stops returning, which left recycled rows stuck at 0.
    return v < 0 ? { height: 'auto', opacity: 1, overflow: 'visible' }
      : { height: v, opacity: natural.get() ? Math.min(1, v / natural.get()) : 0, overflow: 'hidden' }
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
