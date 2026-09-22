import { useEffect, useState } from 'react'

// iOS lays fixed elements out against the viewport the keyboard shrank. After the keyboard closes they can stay
// there (the tab bar floated a quarter of the way up) until the next scroll recomputes them. So: the bar hides while
// a field has focus, like a native tab bar under the keyboard, and once the keyboard has gone the page takes a 1px
// scroll round trip before the bar comes back.
const TEXT = /^(text|search|email|number|tel|url|password|date|datetime-local|month|time|week)$/

function isField(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  return el instanceof HTMLInputElement && TEXT.test(el.type)
}

/** True while a text field has focus, and until the viewport has settled after it loses focus. */
export function useTyping() {
  const [typing, setTyping] = useState(() => isField(document.activeElement))
  useEffect(() => {
    let timer = 0
    const settle = () => {
      timer = 0
      if (isField(document.activeElement)) return
      const y = window.scrollY
      window.scrollTo(0, y > 0 ? y - 1 : y + 1)
      window.scrollTo(0, y)
      setTyping(false)
    }
    const wait = (ms: number) => { clearTimeout(timer); timer = window.setTimeout(settle, ms) }
    const onIn = (e: FocusEvent) => { if (isField(e.target)) { clearTimeout(timer); timer = 0; setTyping(true) } }
    const onOut = (e: FocusEvent) => { if (isField(e.target)) wait(400) }
    // The keyboard animates the visual viewport; wait for it to stop resizing before settling.
    const onResize = () => { if (timer) wait(150) }
    const vv = window.visualViewport
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    vv?.addEventListener('resize', onResize)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
      vv?.removeEventListener('resize', onResize)
    }
  }, [])
  return typing
}
