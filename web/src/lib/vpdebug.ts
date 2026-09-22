// TEMPORARY (2026-09-22): viewport numbers for the tab-bar-after-keyboard bug. Each call is a GET to a route that
// doesn't exist; uvicorn's access log (journalctl -u tally) records the query string. Remove once diagnosed.
export function vp(e: string, bar?: HTMLElement | null) {
  const v = window.visualViewport
  const r = bar?.getBoundingClientRect()
  const q = new URLSearchParams({
    e, ih: String(window.innerHeight), ch: String(document.documentElement.clientHeight), sh: String(screen.height),
    vh: String(v?.height.toFixed(1)), vt: String(v?.offsetTop.toFixed(1)), sy: String(window.scrollY),
    dh: String(document.documentElement.scrollHeight), bt: String(r?.top.toFixed(1)), bb: String(r?.bottom.toFixed(1)),
    ae: document.activeElement?.tagName ?? '-',
  })
  fetch(`/api/_vp?${q}`).catch(() => {})
}
