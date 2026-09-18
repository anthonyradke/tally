import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import s from './Toast.module.css'

export interface ToastInput { message: string; action?: { label: string; onClick: () => void }; tone?: 'default' | 'error' }
interface ToastMsg extends ToastInput { id: number }

const Ctx = createContext<{ show: (t: ToastInput) => void }>({ show: () => {} })
export const useToast = () => useContext(Ctx)

/** Undo-style feedback above the tab bar. Destructive actions use this instead of confirm dialogs. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([])
  const seq = useRef(0)
  const dismiss = useCallback((id: number) => setItems((x) => x.filter((t) => t.id !== id)), [])
  const show = useCallback((t: ToastInput) => {
    const id = ++seq.current
    setItems((x) => [...x.slice(-1), { ...t, id }])
    window.setTimeout(() => dismiss(id), t.action ? 6000 : 3200)
  }, [dismiss])

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {createPortal(
        <div className={s.stack} aria-live="polite">
          <AnimatePresence>
            {items.map((t) => (
              <motion.div key={t.id} layout role="status" className={`${s.toast} ${t.tone === 'error' ? s.error : ''}`}
                initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
                <span className={s.msg}>{t.message}</span>
                {t.action && (
                  <button type="button" className={s.action} onClick={() => { t.action!.onClick(); dismiss(t.id) }}>{t.action.label}</button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  )
}
