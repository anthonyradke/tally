import { useCallback, useMemo, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router'
import { motion } from 'motion/react'
import { AddContext, type AddApi } from './lib/add'
import { TabBar } from './components/TabBar'
import { Home } from './screens/Home'
import { Activity } from './screens/Activity'
import { AddSheet, type Seed } from './screens/AddSheet'
import s from './App.module.css'

function Stub({ title }: { title: string }) {
  return <div><h1 className={s.stubTitle}>{title}</h1><p className="secondary">Coming in phase 3.</p></div>
}

export default function App() {
  const location = useLocation()
  const [add, setAdd] = useState<{ open: boolean; seed: Seed }>({ open: false, seed: {} })
  const api = useMemo<AddApi>(() => ({
    open: (seed) => setAdd({ open: true, seed: seed ?? {} }),
    close: () => setAdd((a) => ({ ...a, open: false })),
  }), [])
  const close = useCallback(() => api.close(), [api])

  return (
    <AddContext.Provider value={api}>
      <div className={s.shell}>
        <main className={s.main}>
          <motion.div key={location.pathname} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}>
            <Routes location={location}>
              <Route path="/" element={<Home />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/accounts/*" element={<Stub title="Accounts" />} />
              <Route path="/insights/*" element={<Stub title="Insights" />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </motion.div>
        </main>
        <TabBar />
      </div>
      <AddSheet open={add.open} seed={add.seed} onClose={close} />
    </AddContext.Provider>
  )
}
