import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Route, Routes, useLocation, useNavigationType } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { AddContext, type AddApi } from './lib/add'
import { TabBar } from './components/TabBar'
import { Palette } from './components/Palette'
import { Skeleton } from './components/Skeleton'
import { useBootstrap } from './lib/data'
import { Home } from './screens/Home'
import { Activity } from './screens/Activity'
import { AddSheet, type Seed } from './screens/AddSheet'
import { Accounts } from './screens/Accounts'
import { AccountDetail } from './screens/AccountDetail'
import { Insights } from './screens/Insights'
import { Settings } from './screens/Settings'
import s from './App.module.css'

type Dir = 'tab' | 'push' | 'pop'
const depth = (path: string) => path.split('/').filter(Boolean).length
const EASE = [0.2, 0.8, 0.2, 1] as const

// Tab switches crossfade in place; going deeper (account, settings section) slides in from the right and
// coming back slides out to it, like a navigation stack. The exiting page uses the same direction.
const page = {
  enter: (d: Dir) => ({ opacity: 0, x: d === 'push' ? 56 : d === 'pop' ? -32 : 0, y: d === 'tab' ? 10 : 0 }),
  show: { opacity: 1, x: 0, y: 0, transition: { duration: 0.34, ease: EASE } },
  exit: (d: Dir) => ({ opacity: 0, x: d === 'push' ? -32 : d === 'pop' ? 56 : 0, y: d === 'tab' ? -6 : 0, transition: { duration: 0.18, ease: EASE } }),
}

export default function App() {
  const location = useLocation()
  const navType = useNavigationType()
  const boot = useBootstrap()
  const [add, setAdd] = useState<{ open: boolean; seed: Seed }>({ open: false, seed: {} })
  const api = useMemo<AddApi>(() => ({
    open: (seed) => setAdd({ open: true, seed: seed ?? {} }),
    close: () => setAdd((a) => ({ ...a, open: false })),
  }), [])
  const close = useCallback(() => api.close(), [api])

  const last = useRef({ path: location.pathname, dir: 'tab' as Dir })
  if (last.current.path !== location.pathname) {
    const d = depth(location.pathname) - depth(last.current.path)
    last.current = { path: location.pathname, dir: d > 0 ? 'push' : d < 0 ? 'pop' : 'tab' }
  }
  const dir = last.current.dir

  // Every page starts at the top; Back returns to where you were.
  const scrolls = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const path = location.pathname
    window.scrollTo({ top: navType === 'POP' ? scrolls.current.get(path) ?? 0 : 0 })
    return () => { scrolls.current.set(path, window.scrollY) }
  }, [location.pathname, navType])

  return (
    <AddContext.Provider value={api}>
      <div className={s.shell}>
        <div className={s.topFade} aria-hidden />
        <main className={s.main}>
          {!boot.data ? <Skeleton /> : <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}><AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div key={location.pathname} className={s.page} custom={dir} variants={page} initial="enter" animate="show" exit="exit">
              <Routes location={location}>
                <Route path="/" element={<Home />} />
                <Route path="/activity" element={<Activity />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/accounts/:id" element={<AccountDetail />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/:section" element={<Settings />} />
                <Route path="*" element={<Home />} />
              </Routes>
            </motion.div>
          </AnimatePresence></motion.div>}
        </main>
        <TabBar />
      </div>
      <AddSheet open={add.open} seed={add.seed} onClose={close} />
      <Palette />
    </AddContext.Provider>
  )
}
