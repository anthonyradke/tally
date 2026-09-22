import { useEffect, useState } from 'react'

// iOS lays fixed elements out against the viewport the keyboard shrank. After the keyboard closes they can stay
// there (the tab bar floated a quarter of the way up) until the next scroll recomputes them. So the bar hides while
// the keyboard is up, like a native tab bar under the keyboard, and once it has gone the page takes a 1px scroll
// round trip before the bar comes back.
// Keyed off the visual viewport, not focus events: a focused field that unmounts (a closing sheet's search box) never
// fires focusout, which left the bar hidden with no keyboard on screen.
const TEXT = /^(text|search|email|number|tel|url|password|date|datetime-local|month|time|week)$/

function isField(el: Element | null) {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  return el instanceof HTMLInputElement && TEXT.test(el.type)
}

/** The on-screen keyboard covers part of the layout viewport (pinch zoom doesn't count). */
function keyboardUp(vv: VisualViewport) {
  return window.innerHeight - vv.height * vv.scale > 150
}

/** True while the on-screen keyboard is up for a text field, and until the page has settled after it closes. */
export function useTyping() {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let hidden = false
    let timer = 0
    const settle = () => {
      timer = 0
      if (keyboardUp(vv)) return
      const y = window.scrollY
      window.scrollTo(0, y > 0 ? y - 1 : y + 1)
      window.scrollTo(0, y)
      hidden = false
      setTyping(false)
    }
    const check = () => {
      if (keyboardUp(vv)) {
        window.clearTimeout(timer); timer = 0
        if (!hidden && isField(document.activeElement)) { hidden = true; setTyping(true) }
      } else if (hidden) {
        // The keyboard animates the viewport; settle once it stops resizing.
        window.clearTimeout(timer); timer = window.setTimeout(settle, 150)
      }
    }
    const later = () => window.setTimeout(check, 50)
    vv.addEventListener('resize', check)
    document.addEventListener('focusin', check)
    document.addEventListener('focusout', later)
    return () => {
      window.clearTimeout(timer)
      vv.removeEventListener('resize', check)
      document.removeEventListener('focusin', check)
      document.removeEventListener('focusout', later)
    }
  }, [])
  return typing
}
