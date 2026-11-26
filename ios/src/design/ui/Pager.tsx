// Cards side by side that a swipe pages through, with page dots under them, like the Home Screen's pages: the card
// follows the finger, rubber-bands past the first and last, and settles on a critically damped spring that carries
// the swipe's speed. Only a sideways swipe pages (a vertical one scrolls the screen), and a chart inside that waits
// for a hold to read values gets the finger once it's held. The page last looked at is remembered.
import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { space, usePalette } from '../theme'

const SPRING = { dampingRatio: 1, duration: 420 } as const

/** `pages`: each one a card, laid out full width within the screen's margins (the pager reaches the screen's edges
 *  so a card slides out of sight rather than being cut at the margin). `remember`: the storage key for the page. */
export function Pager({ pages, labels, remember }: { pages: ReactNode[]; labels: string[]; remember?: string }) {
  const p = usePalette()
  const n = pages.length
  const [w, setW] = useState(0)
  const [page, setPage] = useState(0)
  const pos = useSharedValue(0) // pages from the first, fractional while moving
  const touched = useSharedValue(false) // moved before the remembered page loaded

  // The page last looked at, unless the person already moved before it loaded.
  useEffect(() => {
    if (!remember) return
    let live = true
    AsyncStorage.getItem(remember).then((v) => {
      const i = Number(v)
      if (!live || touched.get() || v === null || !Number.isInteger(i) || i < 0 || i >= n) return
      setPage(i); pos.set(i)
    }).catch(() => {})
    return () => { live = false }
  }, [remember, n, pos, touched])

  const settle = (i: number) => {
    setPage(i)
    if (remember) AsyncStorage.setItem(remember, String(i)).catch(() => {})
  }
  const go = (i: number) => {
    const to = Math.max(0, Math.min(n - 1, i))
    touched.set(true)
    pos.set(withSpring(to, SPRING))
    settle(to)
  }

  const from = useSharedValue(0)
  const swipe = Gesture.Pan().activeOffsetX([-12, 12]).failOffsetY([-10, 10])
    .onStart(() => { touched.set(true); from.set(pos.get()) })
    .onUpdate((e) => {
      const raw = from.get() - e.translationX / Math.max(1, w)
      // Past either end the card gives a little and pulls back, the way a scroll view's edge does.
      const over = raw < 0 ? raw : raw > n - 1 ? raw - (n - 1) : 0
      pos.set(over ? raw - over + (over / (1 + Math.abs(over) * 4)) * 0.55 : raw)
    })
    .onEnd((e) => {
      const start = Math.round(from.get())
      // A flick pages whatever the distance; a slow drag pages once it's a quarter of the way over.
      const moved = pos.get() - start
      const fast = Math.abs(e.velocityX) > 350
      let to = fast ? start + (e.velocityX < 0 ? 1 : -1) : Math.abs(moved) > 0.25 ? start + Math.sign(moved) : start
      to = Math.max(0, Math.min(n - 1, to))
      pos.set(withSpring(to, { ...SPRING, velocity: -e.velocityX / Math.max(1, w) }))
      scheduleOnRN(settle, to)
    })

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: -pos.get() * w }] }), [w])
  return (
    <View style={{ gap: space.s + 2 }}>
      <View style={{ marginHorizontal: -space.l, overflow: 'hidden' }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {/* touchAction and userSelect only matter on the web preview: the browser keeps vertical scrolling to itself. */}
        <GestureDetector gesture={swipe} touchAction="pan-y" userSelect="none">
          <Animated.View style={[{ flexDirection: 'row', width: w ? w * n : '100%' }, row]}>
            {pages.map((node, i) => (
              <View key={i} style={{ width: w || '100%', paddingHorizontal: space.l, display: w || i === page ? 'flex' : 'none' }}
                accessibilityElementsHidden={i !== page} importantForAccessibility={i === page ? 'auto' : 'no-hide-descendants'}>
                {node}
              </View>
            ))}
          </Animated.View>
        </GestureDetector>
      </View>
      {n > 1 && <Dots n={n} pos={pos} page={page} labels={labels} onPick={go} active={p.label} idle={p.label4} />}
    </View>
  )
}

/** UIPageControl: a dot a page, the current one dark, following the swipe as it moves. Tapping one goes there;
 *  VoiceOver swipes up and down to change page. */
function Dots({ n, pos, page, labels, onPick, active, idle }: {
  n: number; pos: SharedValue<number>; page: number; labels: string[]; onPick: (i: number) => void; active: string; idle: string
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 2 }} accessible accessibilityRole="adjustable"
      accessibilityLabel="Page" accessibilityValue={{ text: `${labels[page] ?? ''}, page ${page + 1} of ${n}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onPick(page + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}>
      {Array.from({ length: n }, (_, i) => (
        <Pressable key={i} onPress={() => onPick(i)} hitSlop={8} style={{ padding: 4 }}>
          <Dot i={i} pos={pos} active={active} idle={idle} />
        </Pressable>
      ))}
    </View>
  )
}

function Dot({ i, pos, active, idle }: { i: number; pos: SharedValue<number>; active: string; idle: string }) {
  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(Math.max(0, 1 - Math.abs(pos.get() - i)), [0, 1], [idle, active]),
  }), [i, active, idle])
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 3.5 }, style]} />
}
