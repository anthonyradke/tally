import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api as client } from './api/client'
import { Route, Routes, useLocation, useNavigationType } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { AddContext, type AddApi } from './lib/add'
import { TabBar } from './components/TabBar'
import { Palette } from './components/Palette'
import { OutboxSync } from './components/Outbox'
import { Skeleton } from './components/Skeleton'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useBootstrap } from './lib/data'
import { useSplash } from './lib/splash'
import { takeNativeSwipe, trackEntry } from './lib/nav'
import { Home } from './screens/Home'
import { Activity } from './screens/Activity'
import { AddSheet, type Seed } from './screens/AddSheet'
import { Accounts } from './screens/Accounts'
import { AccountDetail } from './screens/AccountDetail'
import { Insights } from './screens/Insights'
import { Settings } from './screens/Settings'
import s from './App.module.css'

type Dir = 'tab' | 'push' | 'pop' | 'none'
// Tab roots (/, /activity, /settings…) are all depth 0; /accounts/3 and /settings/general are one level in.
const depth = (path: string) => Math.max(0, path.split('/').filter(Boolean).length - 1)
const EASE = [0.2, 0.8, 0.2, 1] as const
// UIKit's navigation curve: quick start, long settle. Both pages share one duration so they move as a pair.
const SLIDE = { duration: 0.46, ease: [0.32, 0.72, 0, 1] as const, zIndex: { duration: 0 } }
const FADE = { duration: 0.22, ease: EASE, zIndex: { duration: 0 } }

// Pages are opaque, full-bleed layers, so transitions work like a native navigation stack: going deeper slides the
// new page over from the right edge while the old one drifts left and dims; Back reverses it. Tab switches fade the
// new page in over the old one (which stays put until covered, so nothing dips to blank). A native iOS edge swipe
// already animated, so it gets no transition ('none'). `transform` strings keep all of it on the compositor.
const tx = (x: string) => `translate3d(${x}, 0, 0)`
const page = {
  enter: (d: Dir) => d === 'push' ? { opacity: 1, transform: tx('100%'), zIndex: 2 }
    : d === 'pop' ? { opacity: 0.7, transform: tx('-28%'), zIndex: 0 }
    : { opacity: d === 'tab' ? 0 : 1, transform: tx('0%'), zIndex: 2 },
  show: (d: Dir) => ({ opacity: 1, transform: tx('0%'), zIndex: 1, transition: d === 'tab' ? FADE : d === 'none' ? { duration: 0 } : SLIDE }),
  exit: (d: Dir) => d === 'push' ? { opacity: 0.7, transform: tx('-28%'), zIndex: 0, transition: SLIDE }
    : d === 'pop' ? { opacity: 1, transform: tx('100%'), zIndex: 3, transition: SLIDE }
    : d === 'tab' ? { opacity: 0, zIndex: 0, transition: { duration: 0.01, delay: FADE.duration, zIndex: { duration: 0 } } }
    : { opacity: 0, transition: { duration: 0 } },
}

export default function App() {
  const location = useLocation()
  const navType = useNavigationType()
  const boot = useBootstrap()
  const qc = useQueryClient()
  // Warm the Add sheet's merchant memory while idle, so its first open doesn't parse 300 rows mid-animation.
  const booted = !!boot.data
  useEffect(() => {
    if (!booted) return
    const id = window.setTimeout(() => qc.prefetchQuery({ queryKey: ['transactions', { limit: 300 }], queryFn: () => client.transactions({ limit: 300 }), staleTime: 30_000 }), 1500)
    return () => window.clearTimeout(id)
  }, [booted, qc])
  const revealed = useSplash(!!boot.data)
  const [add, setAdd] = useState<{ open: boolean; seed: Seed }>({ open: false, seed: {} })
  const api = useMemo<AddApi>(() => ({
    open: (seed) => setAdd({ open: true, seed: seed ?? {} }),
    close: () => setAdd((a) => ({ ...a, open: false })),
  }), [])
  const close = useCallback(() => api.close(), [api])

  const last = useRef({ path: location.pathname, dir: 'tab' as Dir })
  if (last.current.path !== location.pathname) {
    const d = depth(location.pathname) - depth(last.current.path)
    const native = navType === 'POP' && takeNativeSwipe()
    last.current = { path: location.pathname, dir: native ? 'none' : d > 0 ? 'push' : d < 0 ? 'pop' : 'tab' }
  }
  const dir = last.current.dir

  // Every page starts at the top; Back returns to where you were. The position is tracked from scroll events,
  // because by the time the route changes the outgoing page has already been lifted out of the flow.
  const scrolls = useRef(new Map<string, number>())
  const y = useRef(0)
  const shown = useRef(location.pathname)
  useEffect(() => {
    window.history.scrollRestoration = 'manual'
    const on = () => { y.current = window.scrollY }
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  useLayoutEffect(() => {
    const path = location.pathname
    trackEntry(path)
    if (shown.current === path) return
    const from = y.current
    scrolls.current.set(shown.current, from)
    shown.current = path
    window.scrollTo({ top: navType === 'POP' ? scrolls.current.get(path) ?? 0 : 0 })
    y.current = window.scrollY
    // Scrolling moved the outgoing page too; offset it so it leaves from exactly where it was on screen.
    const shift = `${y.current - from}px`
    for (const el of document.querySelectorAll<HTMLElement>('[data-page]')) if (el.dataset.page !== path) el.style.marginTop = shift
  }, [location.pathname, navType])

  return (
    <AddContext.Provider value={api}>
      <div className={s.shell}>
        <div className={s.topFade} aria-hidden />
        <main className={s.main}>
          {!boot.data || !revealed ? <div className={s.page}><Skeleton /></div> : <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}><AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div key={location.pathname} data-page={location.pathname} className={s.page} custom={dir} variants={page} initial="enter" animate="show" exit="exit">
              {/* Per page, so a broken screen keeps the tab bar; it resets on navigation (the page remounts). */}
              <ErrorBoundary><Routes location={location}>
                <Route path="/" element={<Home />} />
                <Route path="/activity" element={<Activity />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/accounts/:id" element={<AccountDetail />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/:section" element={<Settings />} />
                <Route path="*" element={<Home />} />
              </Routes></ErrorBoundary>
            </motion.div>
          </AnimatePresence></motion.div>}
        </main>
        <TabBar />
      </div>
      <AddSheet open={add.open} seed={add.seed} onClose={close} />
      <Palette />
      <OutboxSync />
    </AddContext.Provider>
  )
}
