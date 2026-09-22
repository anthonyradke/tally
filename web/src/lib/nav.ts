import { useCallback } from 'react'
import { useNavigate } from 'react-router'

// iOS edge-swipe back/forward animates its own snapshot of the previous page. If the app then plays its pop
// transition too, the page visibly cuts and re-animates. A POP that follows an edge touch that moved (or was taken
// over by the system, i.e. cancelled) is treated as native and shown without a transition. Taps don't count.
const EDGE = 24
let edge = { at: 0, x0: 0, swiped: false }
if (typeof window !== 'undefined') {
  const opts = { passive: true, capture: true }
  window.addEventListener('touchstart', (e) => {
    const x = e.touches[0]?.clientX ?? EDGE
    edge = x < EDGE || x > window.innerWidth - EDGE ? { at: performance.now(), x0: x, swiped: false } : { at: 0, x0: 0, swiped: false }
  }, opts)
  window.addEventListener('touchmove', (e) => {
    if (edge.at && Math.abs((e.touches[0]?.clientX ?? edge.x0) - edge.x0) > 10) edge.swiped = true
  }, opts)
  window.addEventListener('touchcancel', () => { if (edge.at) edge.swiped = true }, opts)
}

/** True once if the current POP came from a native edge swipe. */
export function takeNativeSwipe() {
  const hit = edge.swiped && performance.now() - edge.at < 5000
  edge = { at: 0, x0: 0, swiped: false }
  return hit
}

// Path of each history entry by react-router's index, so an in-app Back can pop instead of pushing the parent
// (pushing made the next swipe-back land on the child again).
const paths: string[] = []
export function trackEntry(path: string) {
  const idx = (window.history.state as { idx?: number } | null)?.idx
  if (typeof idx === 'number') paths[idx] = path
}

/** Back to `parent`: pops when the previous entry is the parent, otherwise navigates there. */
export function useBack(parent: string) {
  const nav = useNavigate()
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0 && paths[idx - 1] === parent) nav(-1)
    else nav(parent)
  }, [nav, parent])
}
