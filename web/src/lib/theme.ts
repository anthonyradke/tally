export type Theme = 'system' | 'light' | 'dark'
const KEY = 'money.theme'

export function getTheme(): Theme {
  const t = localStorage.getItem(KEY)
  return t === 'light' || t === 'dark' ? t : 'system'
}

const BAR = { light: '#F2F2F7', dark: '#000000' }

/** Sets data-theme on <html>; tokens.css switches color-scheme (and every light-dark() token) from it. The
 *  theme-color metas follow too, so Safari's bars match a forced theme instead of the system one. */
export function applyTheme(t: Theme) {
  if (t === 'system') { delete document.documentElement.dataset.theme; localStorage.removeItem(KEY) }
  else { document.documentElement.dataset.theme = t; localStorage.setItem(KEY, t) }
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = m.media.includes('dark') ? BAR.dark : BAR.light
    m.content = t === 'system' ? own : BAR[t]
  }
}
