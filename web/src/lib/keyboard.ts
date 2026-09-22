import { useEffect, useState, type RefObject } from 'react'
import { vp } from './vpdebug'

// iOS lays fixed elements out against the viewport the keyboard shrank. After the keyboard closes they can stay
// there (the tab bar floated a quarter of the way up) until the next scroll recomputes them. So the bar hides while
// the keyboard is up, like a native tab bar under the keyboard, and once it has gone the page takes a 1px scroll
// round trip and a forced re-layout of the bar before it comes back. A short page can't scroll, so the re-layout
// is what fixes it there (Settings > Quick actions > Add, type, Cancel left the bar a little high).
// Keyed off the visual viewport, not focus events: a focused field that unmounts (a closing sheet's search box) never
// fires focusout, which left the bar hidden with no keyboard on screen.
const TEXT = /^(text|search|email|number|tel|url|password|date|datetime-local|month|time|week)$/

function isField(el: Element | null) {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  return el instanceof HTMLInputElement && TEXT.test(el.type)
}

// Tallest viewport seen at the current width. innerHeight alone isn't a safe baseline: an installed app on iOS can
// shrink it along with the keyboard.
let full = { w: 0, h: 0 }

/** The on-screen keyboard covers part of the screen (pinch zoom doesn't count). */
function keyboardUp(vv: VisualViewport) {
  const h = vv.height * vv.scale
  if (full.w !== window.innerWidth) full = { w: window.innerWidth, h: 0 }
  full.h = Math.max(full.h, h, window.innerHeight)
  return full.h - h > 150
}

/** True while the on-screen keyboard is up for a text field, and until the page has settled after it closes. */
export function useTyping(bar: RefObject<HTMLElement | null>) {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    keyboardUp(vv)
    let hidden = false
    let timer = 0
    const settle = () => {
      timer = 0
      if (keyboardUp(vv)) return
      const el = bar.current
      vp('settle', el)
      // A real 1px scroll round trip, like the swipe that fixes it by hand. Short pages can't scroll, so they get
      // 2px of extra room for the duration.
      const root = document.documentElement
      const y = window.scrollY
      root.style.paddingBottom = '2px'
      window.scrollTo(0, y + 1)
      requestAnimationFrame(() => {
        vp('nudged', el)
        window.scrollTo(0, y)
        root.style.paddingBottom = ''
        if (el) { el.style.display = 'none'; void el.offsetHeight; el.style.display = '' }
        hidden = false
        setTyping(false)
        window.setTimeout(() => vp('after', el), 600)
      })
    }
    const check = (ev?: Event) => {
      if (ev) vp(ev.type + (keyboardUp(vv) ? '-up' : '-down'), bar.current)
      if (keyboardUp(vv)) {
        window.clearTimeout(timer); timer = 0
        if (!hidden && isField(document.activeElement)) { hidden = true; setTyping(true) }
      } else if (hidden) {
        // The keyboard animates the viewport; settle once it stops resizing.
        window.clearTimeout(timer); timer = window.setTimeout(settle, 150)
      }
    }
    const later = () => window.setTimeout(() => check(new Event('focusout')), 50)
    vv.addEventListener('resize', check)
    document.addEventListener('focusin', check)
    document.addEventListener('focusout', later)
    return () => {
      window.clearTimeout(timer)
      vv.removeEventListener('resize', check)
      document.removeEventListener('focusin', check)
      document.removeEventListener('focusout', later)
    }
  }, [bar])
  return typing
}
