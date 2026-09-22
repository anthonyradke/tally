import { useEffect, useState, type RefObject } from 'react'
import { vp } from './vpdebug'

// iOS bug in installed web apps: after the keyboard closes, WebKit leaves the window at the keyboard-era height
// (logged on the iPhone: innerHeight stuck at 812 of 874 until a manual overscroll). Fixed elements sit on the short
// window's bottom edge, so the tab bar floated ~60pt up with a dead black band under it, and nothing below 812 painted.
// Nothing the page does makes WebKit re-measure afterwards (a programmatic scroll, taking #root out of layout); only a
// finger overscroll does. What causes it is iOS moving the whole window to bring a focused field above the keyboard
// (every stuck case logged a window scroll; a field already above the keyboard left the height alone). So when a field
// takes focus, lift() scrolls its own container (a sheet's body, or the page) until the field clears the keyboard,
// before iOS looks, adding bottom padding for the duration when there isn't room, like a native form's keyboard inset.
// If the window still ends up short, --vp-short moves the bar down by the difference. The bar hides while typing.
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

// Room the keyboard takes from the bottom of the screen: 396pt for the letters keyboard with suggestions on an 874pt
// iPhone, 370pt for the decimal pad. Rounded up, plus a gap so iOS doesn't nudge a field sitting right on the edge.
const KEYBOARD = 400
const GAP = 16
// Date and time fields open a picker, not the keyboard.
const PICKER = /^(date|datetime-local|month|time|week)$/
let inset: Array<{ el: HTMLElement; pad: string }> = []

function scroller(el: HTMLElement): HTMLElement | null | undefined {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p)
    if (/(auto|scroll)/.test(cs.overflowY)) return p
    if (cs.position === 'fixed') return undefined // fixed and not scrollable: nothing to move
  }
  return null // the page itself
}

/** Scroll a field that's about to get the keyboard above the keyboard's top edge, so iOS doesn't move the window. */
function lift(vv: VisualViewport, el: Element | null) {
  if (!standalone() || !isField(el) || (el instanceof HTMLInputElement && PICKER.test(el.type))) return
  const field = el as HTMLElement
  const top = keyboardUp(vv) ? vv.offsetTop + vv.height : full.h - KEYBOARD
  const over = Math.ceil(field.getBoundingClientRect().bottom + GAP - top)
  if (over <= 0) return
  const box = scroller(field)
  if (box === undefined) return
  const page = box === null
  const target = page ? document.body : box
  // Enough bottom padding that the container can scroll `over` further. Measured from where the content ends, since
  // padding only adds scroll room once the content outgrows the container (a short form in a tall sheet doesn't).
  const origin = page ? -window.scrollY : box.getBoundingClientRect().top + box.clientTop - box.scrollTop
  let end = 0
  for (const c of target.children) if (getComputedStyle(c).position !== 'fixed') end = Math.max(end, c.getBoundingClientRect().bottom)
  const pad = (page ? window.scrollY + window.innerHeight : box.scrollTop + box.clientHeight) + over - (end - origin)
  if (pad > parseFloat(getComputedStyle(target).paddingBottom)) {
    if (!inset.some((i) => i.el === target)) inset.push({ el: target, pad: target.style.paddingBottom })
    target.style.paddingBottom = `${Math.ceil(pad)}px`
  }
  if (page) window.scrollBy(0, over)
  else box.scrollTop += over
  vp('lift-' + over + (page ? '-page' : '-box'))
}

function unlift() {
  for (const { el, pad } of inset) el.style.paddingBottom = pad
  inset = []
}

/** How far the window is short of its full height, for the bar to make up (0 in Safari and while typing). */
function pin(vv: VisualViewport) {
  const short = standalone() && !keyboardUp(vv) ? Math.max(0, Math.round(full.h - window.innerHeight)) : 0
  document.documentElement.style.setProperty('--vp-short', `${short}px`)
  return short
}

/** True while the on-screen keyboard is up for a text field, and until the page has settled after it closes. */
export function useTyping(bar: RefObject<HTMLElement | null>) {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    measure(vv)
    pin(vv)
    let hidden = false
    let timer = 0
    const settle = () => {
      timer = 0
      if (keyboardUp(vv) || isField(document.activeElement)) return
      unlift()
      vp('settle-short-' + pin(vv), bar.current)
      hidden = false
      setTyping(false)
    }
    const check = (ev?: Event) => {
      measure(vv)
      pin(vv)
      if (ev) vp(ev.type + (keyboardUp(vv) ? '-up' : '-down'), bar.current)
      window.clearTimeout(timer); timer = 0
      if (keyboardUp(vv)) {
        if (!hidden && isField(document.activeElement)) { hidden = true; setTyping(true) }
      } else {
        // Wait for the keyboard to finish animating and focus to settle, then bring the bar back.
        timer = window.setTimeout(settle, 150)
      }
    }
    const onFocusIn = (ev: FocusEvent) => { measure(vv); lift(vv, ev.target as Element); check(ev) }
    const onFocusOut = () => window.setTimeout(() => check(new Event('focusout')), 50)
    vv.addEventListener('resize', check)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      window.clearTimeout(timer)
      unlift()
      vv.removeEventListener('resize', check)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [bar])
  return typing
}
