import { useEffect, useState, type RefObject } from 'react'
import { vp } from './vpdebug'

// iOS bug in installed web apps: after the keyboard closes, WebKit leaves the window at the keyboard-era height
// (logged on the iPhone: innerHeight stuck at 812 of 874 until a manual overscroll). Fixed elements sit on the short
// window's bottom edge, so the tab bar floated ~60pt up with a dead black band under it, and nothing below 812 painted.
// It heals on any real scroll (the log showed innerHeight climbing 814, 820 … 874 as the overscroll went -2 … -15px),
// so after the keyboard closes the app scrolls 1px and back. Short pages can't scroll, so a 2px spacer in <body> gives
// them room for the round trip (padding on <html> doesn't: it's height: 100% border-box). The bar hides while the
// keyboard is up so it never shows mid-bug.
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

/** Scroll 1px and back so WebKit re-measures the window if the keyboard left it short. */
function heal(vv: VisualViewport) {
  if (!standalone() || keyboardUp(vv) || isField(document.activeElement) || full.h - window.innerHeight < 4) return
  vp('heal-before')
  const spacer = document.createElement('div')
  spacer.style.height = '2px'
  document.body.appendChild(spacer)
  const y = window.scrollY
  window.scrollTo(0, y + 1)
  requestAnimationFrame(() => {
    vp('heal-nudged')
    window.scrollTo(0, y)
    spacer.remove()
    vp('heal-after')
    window.setTimeout(() => vp('heal-later'), 600)
  })
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
