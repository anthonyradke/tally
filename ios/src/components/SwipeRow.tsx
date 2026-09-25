// Swipe actions the way Mail does them on iOS 26: the row slides aside and the actions come up as circles that grow
// with the swipe. Keep going and the edge action stretches into a capsule across the whole gap with a tick; let go
// there and it runs (a destructive one slides the row away first). A short swipe that passes halfway rests open;
// tapping the row, swiping another one or scrolling the list closes it again.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import * as Haptics from 'expo-haptics'
import type { SFSymbol } from 'expo-symbols'
import { Icon } from './Icon'

export interface SwipeAction { label: string; sf: SFSymbol; md: string; color: string; run: () => void; destructive?: boolean }

const SLOT = 66     // width each action takes when the row rests open
const CIRCLE = 46   // the circle at full size
const PAD = 10      // the capsule's inset from the gap's edges
const SPRING = { damping: 26, stiffness: 260, mass: 0.9 }

// Only one row rests open at a time.
const registry = {
  open: null as (() => void) | null,
  claim(close: () => void) { if (this.open && this.open !== close) this.open(); this.open = close },
  release(close: () => void) { if (this.open === close) this.open = null },
}
/** Close whichever row is resting open (call it when a list starts scrolling). */
export function closeSwipes() { const close = registry.open; registry.open = null; close?.() }

export function SwipeRow({ left = [], right = [], enabled = true, resetKey, children }: {
  left?: SwipeAction[]; right?: SwipeAction[]; enabled?: boolean; resetKey?: unknown; children: ReactNode
}) {
  const reduce = useReducedMotion()
  const w = useSharedValue(0)
  const tx = useSharedValue(0)
  const start = useSharedValue(0)
  const armed = useSharedValue(0)   // -1: right edge action armed, 1: left edge action armed
  const armT = useSharedValue(0)    // the stretch, animated
  const [open, setOpen] = useState(false)
  const nL = left.length
  const nR = right.length
  const destructiveL = !!left[0]?.destructive
  const destructiveR = !!right[nR - 1]?.destructive

  // Stable (shared values and setters never change), so the registry can compare it by identity.
  const closeFn = useCallback(() => {
    tx.set(withSpring(0, SPRING)); armT.set(withTiming(0, { duration: 160 })); armed.set(0); setOpen(false)
  }, [tx, armT, armed])
  // Recycled rows (FlashList) start closed.
  const [key, setKey] = useState(resetKey)
  if (key !== resetKey) { setKey(resetKey); setOpen(false) }
  useEffect(() => { tx.set(0); armT.set(0); armed.set(0) }, [resetKey, tx, armT, armed])
  useEffect(() => () => registry.release(closeFn), [closeFn])

  const claim = () => registry.claim(closeFn)
  const settled = (isOpen: boolean) => { setOpen(isOpen); if (!isOpen) registry.release(closeFn) }
  const tick = (on: boolean) => Haptics.impactAsync(on ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  const fire = (side: 'left' | 'right') => {
    settled(false)
    const a = side === 'left' ? left[0] : right[nR - 1]
    a?.run()
  }
  const runAt = (a: SwipeAction, side: 'left' | 'right') => {
    if (a.destructive) {
      armT.set(withTiming(1, { duration: 140 }))
      tx.set(withTiming((side === 'left' ? 1 : -1) * w.get(), { duration: 220 }, (ok) => { if (ok) scheduleOnRN(a.run) }))
      return
    }
    closeFn()
    a.run()
  }

  const pan = Gesture.Pan()
    .enabled(enabled && (nL > 0 || nR > 0))
    .activeOffsetX([-14, 14])
    .failOffsetY([-10, 10])
    .onStart(() => {
      start.set(tx.get())
      scheduleOnRN(claim)
    })
    .onUpdate((e) => {
      let x = start.get() + e.translationX
      // No actions on a side: it only gives a little, like a rubber band.
      if (x > 0 && nL === 0) x = x / 8
      if (x < 0 && nR === 0) x = x / 8
      tx.set(x)
      const full = w.get()
      const next = nR > 0 && -x > Math.max(nR * SLOT + 60, full * 0.62) ? -1
        : nL > 0 && x > Math.max(nL * SLOT + 60, full * 0.5) ? 1 : 0
      if (next !== armed.get()) {
        armed.set(next)
        armT.set(reduce ? (next ? 1 : 0) : withSpring(next ? 1 : 0, { damping: 20, stiffness: 320 }))
        scheduleOnRN(tick, next !== 0)
      }
    })
    .onEnd((e) => {
      const x = tx.get()
      const a = armed.get()
      if (a !== 0) {
        const destructive = a < 0 ? destructiveR : destructiveL
        const side = a < 0 ? 'right' : 'left'
        if (destructive) {
          tx.set(withTiming(a * w.get(), { duration: 200 }, (ok) => { if (ok) scheduleOnRN(fire, side) }))
        } else {
          armed.set(0)
          armT.set(withTiming(0, { duration: 200 }))
          tx.set(withSpring(0, SPRING))
          scheduleOnRN(fire, side)
        }
        return
      }
      const v = e.velocityX
      if (x < 0 && nR > 0 && (-x > (nR * SLOT) / 2 || v < -500) && v < 250) {
        tx.set(withSpring(-nR * SLOT, { ...SPRING, velocity: v }))
        scheduleOnRN(settled, true)
      } else if (x > 0 && nL > 0 && (x > (nL * SLOT) / 2 || v > 500) && v > -250) {
        tx.set(withSpring(nL * SLOT, { ...SPRING, velocity: v }))
        scheduleOnRN(settled, true)
      } else {
        tx.set(withSpring(0, { ...SPRING, velocity: v }))
        scheduleOnRN(settled, false)
      }
    })

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() }] }))
  const leftGap = useAnimatedStyle(() => ({ width: Math.max(tx.get(), 0) }))
  const rightGap = useAnimatedStyle(() => ({ width: Math.max(-tx.get(), 0) }))

  return (
    <View onLayout={(e) => w.set(e.nativeEvent.layout.width)}>
      {nL > 0 && (
        <Animated.View style={[styles.gap, { left: 0 }, leftGap]}>
          {left.map((a, i) => <Circle key={a.label} a={a} i={i} n={nL} edge={i === 0} side="left" tx={tx} armT={armT} onPress={() => runAt(a, 'left')} />)}
        </Animated.View>
      )}
      {nR > 0 && (
        <Animated.View style={[styles.gap, { right: 0 }, rightGap]}>
          {right.map((a, i) => <Circle key={a.label} a={a} i={i} n={nR} edge={i === nR - 1} side="right" tx={tx} armT={armT} onPress={() => runAt(a, 'right')} />)}
        </Animated.View>
      )}
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>
          {children}
          {open && <Pressable style={StyleSheet.absoluteFill} onPress={closeFn} accessibilityLabel="Close actions" />}
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

function Circle({ a, i, n, edge, side, tx, armT, onPress }: {
  a: SwipeAction; i: number; n: number; edge: boolean; side: 'left' | 'right'
  tx: SharedValue<number>; armT: SharedValue<number>; onPress: () => void
}) {
  const outer = useAnimatedStyle(() => {
    const W = Math.max(side === 'left' ? tx.get() : -tx.get(), 0)
    const slot = W / n
    const size = Math.min(Math.max(slot - 14, 0), CIRCLE)
    const k = edge ? armT.get() : 0
    const other = edge ? 0 : armT.get()
    const left0 = i * slot + (slot - size) / 2
    const width = size + (Math.max(W - PAD * 2, size) - size) * k
    return {
      left: left0 + (PAD - left0) * k,
      width,
      opacity: 1 - other,
      transform: [{ scale: 1 - other * 0.35 }],
    }
  })
  const inner = useAnimatedStyle(() => {
    const W = Math.max(side === 'left' ? tx.get() : -tx.get(), 0)
    const size = Math.min(Math.max(W / n - 14, 0), CIRCLE)
    const k = edge ? armT.get() : 0
    const h = size + (CIRCLE - size) * k
    return { height: h, borderRadius: h / 2 }
  })
  const glyph = useAnimatedStyle(() => {
    const W = Math.max(side === 'left' ? tx.get() : -tx.get(), 0)
    const size = Math.min(Math.max(W / n - 14, 0), CIRCLE)
    const p = size / CIRCLE
    return { opacity: Math.max(0, (p - 0.35) / 0.65), transform: [{ scale: 0.6 + p * 0.4 }] }
  })
  return (
    <Animated.View style={[styles.slot, outer]}>
      <Animated.View style={[{ backgroundColor: a.color, overflow: 'hidden', borderCurve: 'continuous' }, inner]}>
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a.label}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={glyph}><Icon sf={a.sf} md={a.md} size={19} color="#FFFFFF" weight="semibold" /></Animated.View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  gap: { position: 'absolute', top: 0, bottom: 0, overflow: 'hidden' },
  slot: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
})
