export type Theme = 'system' | 'light' | 'dark'
const KEY = 'money.theme'

export function getTheme(): Theme {
  const t = localStorage.getItem(KEY)
  return t === 'light' || t === 'dark' ? t : 'system'
}

/** Sets data-theme on <html>; tokens.css switches color-scheme (and every light-dark() token) from it. */
export function applyTheme(t: Theme) {
  if (t === 'system') { delete document.documentElement.dataset.theme; localStorage.removeItem(KEY) }
  else { document.documentElement.dataset.theme = t; localStorage.setItem(KEY, t) }
}
