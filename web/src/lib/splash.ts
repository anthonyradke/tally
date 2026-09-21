import { useEffect, useState } from 'react'

// The launch splash lives in index.html so it plays before the bundle loads. It stays until the data is
// ready, but never cuts its own animation short (MIN) and never holds the app hostage on a slow network
// (MAX: the skeleton takes over). Times are from navigation start, which is when the animation began.
const MIN = 1150
const MAX = 2600
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function leave(el: HTMLElement) {
  el.classList.add('out')
  const done = () => el.remove()
  el.addEventListener('transitionend', (e) => { if (e.target === el) done() })
  setTimeout(done, 600)
}

/** False while the splash covers the app; flips to true as it starts to fade, so content mounts (and hero
 *  figures roll in) right as it's revealed. */
export function useSplash(ready: boolean) {
  const [gone, setGone] = useState(() => !document.getElementById('splash'))
  useEffect(() => {
    if (gone) return
    const at = ready ? (reduced() ? 300 : MIN) : MAX
    const id = setTimeout(() => {
      const el = document.getElementById('splash')
      if (el) leave(el)
      setGone(true)
    }, Math.max(0, at - performance.now()))
    return () => clearTimeout(id)
  }, [ready, gone])
  return gone
}
