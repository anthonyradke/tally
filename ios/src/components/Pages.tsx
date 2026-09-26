// Pages that move like a navigation stack inside one screen (the new-entry steps): the next page slides in over the
// current one from the right, and going back slides the current one away to uncover the one before, which comes up
// from a little to the left. Only transforms and a light dim, on shared values each page owns from the moment it
// mounts, so the first frame is already in place and nothing can be left invisible. (A layout animation or a full
// fade that starts while a modal is still presenting can stay stuck and leave the screen blank.)
import { useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, useWindowDimensions } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { useTheme } from '@/theme'
import { EASE } from './ease'

const UNDER = 0.3 // how far the page underneath moves, as a share of the width
/** How long a page takes to slide in. */
export const PAGE_MS = 380

/** Shows the page `page`, drawn by `render`. Changing `page` pushes when `dir` is 1 and pops when it's -1. The first
 *  page just appears (with the modal around it). */
export function Pages<K extends string>({ page, dir, render }: { page: K; dir: 1 | -1; render: (k: K) => ReactNode }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(page)
  const [leaving, setLeaving] = useState<K | null>(null)
  const [moved, setMoved] = useState(false)
  // Derived during render, so the new page mounts in the same commit the old one starts leaving in.
  if (page !== shown) {
    setLeaving(reduce ? null : shown)
    setShown(page)
    setMoved(true)
  }
  const list: { k: K; out: boolean }[] = leaving != null && leaving !== shown ? [{ k: leaving, out: true }, { k: shown, out: false }] : [{ k: shown, out: false }]
  return (
    <>
      {list.map(({ k, out }) => (
        <Page key={k} out={out} dir={dir} enter={moved && !reduce} onGone={() => setLeaving((l) => (l === k ? null : l))}>
          {render(k)}
        </Page>
      ))}
    </>
  )
}

function Page({ out, dir, enter, onGone, children }: { out: boolean; dir: 1 | -1; enter: boolean; onGone: () => void; children: ReactNode }) {
  const { c } = useTheme()
  const { width } = useWindowDimensions()
  const x = useSharedValue(enter ? (dir > 0 ? width : -UNDER * width) : 0)
  useEffect(() => {
    if (!out) { x.set(withTiming(0, { duration: PAGE_MS, easing: EASE })); return }
    x.set(withTiming(dir > 0 ? -UNDER * width : width, { duration: PAGE_MS, easing: EASE }, (ok) => { if (ok) scheduleOnRN(onGone) }))
  }, [out, dir]) // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => {
    const v = x.get()
    return { transform: [{ translateX: v }], opacity: v < 0 ? 1 - 0.35 * Math.min(1, -v / (UNDER * width)) : 1 }
  })
  // Pushing, the new page rides on top; popping, the leaving one does.
  const top = out ? dir < 0 : dir > 0
  return (
    <Animated.View pointerEvents={out ? 'none' : 'auto'} accessibilityElementsHidden={out} importantForAccessibility={out ? 'no-hide-descendants' : 'auto'}
      style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, zIndex: top ? 1 : 0 }, style]}>
      {children}
    </Animated.View>
  )
}
