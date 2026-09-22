import { useEffect, useState, type RefObject } from 'react'
import { vp } from './vpdebug'

// iOS bug in installed web apps: after the keyboard closes, WebKit leaves the window at the keyboard-era height
// (logged on the iPhone: innerHeight stuck at 812 of 874 until a manual overscroll). Fixed elements sit on the short
// window's bottom edge, so the tab bar floated ~60pt up with a dead black band under it, and nothing below 812 painted.
// No scroll or measurement from the page grows it back; taking the full-height #root out of layout and back in makes
// WebKit re-measure (the same fix as dev.to/cederhook's write-up). The bar hides while the keyboard is up so it
// never shows mid-bug.
// Keyed off the visual viewport, not focus events: a focused field that unmounts (a closing sheet's search box) never
// fires focusout.
const TEXT = /^(text|search|email|number|tel|url|password|date|datetime-local|month|time|week)$/

function isField(el: Element | null) {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  return el instanceof HTMLInputElement && TEXT.test(el.type)
}

// Tallest window seen at the current width: the height the app should have with no keyboard.
let full = { w: 0, h: 0 }
function measure(vv: VisualViewport) {
  if (full.w !== window.innerWidth) full = { w: window.innerWidth, h: 0 }
  full.h = Math.max(full.h, vv.height * vv.scale, window.innerHeight)
}
/** The on-screen keyboard covers part of the screen (pinch zoom doesn't count). */
const keyboardUp = (vv: VisualViewport) => full.h - vv.height * vv.scale > 150

// Only the installed app has the bug; in Safari the toolbar changes innerHeight all the time.
const standalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

/** Re-measure the window if the keyboard left it short. Scroll positions don't survive the flip, so put them back. */
function heal(vv: VisualViewport) {
  if (!standalone() || keyboardUp(vv) || isField(document.activeElement) || full.h - window.innerHeight < 4) return
  const root = document.getElementById('root')
  if (!root) return
  vp('heal-before')
  const y = window.scrollY
  root.style.display = 'none'
  void root.offsetHeight
  root.style.display = ''
  window.scrollTo(0, y)
  vp('heal-after')
  window.setTimeout(() => vp('heal-later'), 600)
}

/** True while the on-screen keyboard is up for a text field, and until the window has been healed after it closes. */
export function useTyping(bar: RefObject<HTMLElement | null>) {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    measure(vv)
    let hidden = false
    let timer = 0
    const settle = () => {
      timer = 0
      if (keyboardUp(vv) || isField(document.activeElement)) return
      heal(vv)
      hidden = false
      setTyping(false)
    }
    const check = (ev?: Event) => {
      measure(vv)
      if (ev) vp(ev.type + (keyboardUp(vv) ? '-up' : '-down'), bar.current)
      window.clearTimeout(timer); timer = 0
      if (keyboardUp(vv)) {
        if (!hidden && isField(document.activeElement)) { hidden = true; setTyping(true) }
      } else {
        // Wait for the keyboard to finish animating and focus to settle, then heal and bring the bar back.
        timer = window.setTimeout(settle, 150)
      }
    }
    const onFocusOut = () => window.setTimeout(() => check(new Event('focusout')), 50)
    vv.addEventListener('resize', check)
    document.addEventListener('focusin', check)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      window.clearTimeout(timer)
      vv.removeEventListener('resize', check)
      document.removeEventListener('focusin', check)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [bar])
  return typing
}
