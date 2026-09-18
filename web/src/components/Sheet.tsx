import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMediaQuery } from '@/lib/useMediaQuery'
import s from './Sheet.module.css'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Right-side header action, e.g. a Save button. */
  action?: ReactNode
  /** Full-height sheet (Add entry); default sizes to content. */
  tall?: boolean
}

/** Bottom sheet on phones (spring in, drag down to dismiss); centered dialog from 720px up. */
export function Sheet({ open, onClose, title, children, action, tall }: Props) {
  const wide = useMediaQuery('(min-width: 720px)')
  const reduce = useReducedMotion()
  const panel = useRef<HTMLDivElement>(null)
  const restore = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    restore.current = document.activeElement
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => {
      const first = panel.current?.querySelector<HTMLElement>('[autofocus], input, button')
      ;(first ?? panel.current)?.focus()
    })
    return () => {
      root?.removeAttribute('inert')
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
      ;(restore.current as HTMLElement | null)?.focus?.()
    }
  }, [open, onClose])

  const variants = wide
    ? { hidden: { opacity: 0, scale: 0.96 }, shown: { opacity: 1, scale: 1 } }
    : { hidden: { y: '100%' }, shown: { y: 0 } }
  const transition = reduce
    ? { duration: 0 }
    : wide ? { duration: 0.24, ease: [0.2, 0.8, 0.2, 1] as const } : { type: 'spring' as const, stiffness: 420, damping: 42, mass: 0.9 }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={s.root}>
          <motion.div className={s.scrim} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.24 }} onClick={onClose} />
          <motion.div
            ref={panel}
            role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
            className={`${s.panel} ${tall ? s.tall : ''}`}
            variants={variants} initial="hidden" animate="shown" exit="hidden" transition={transition}
            drag={wide || reduce ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => { if (info.offset.y > 120 || info.velocity.y > 700) onClose() }}
          >
            {!wide && <div className={s.grabber} aria-hidden />}
            <header className={s.header}>
              <button type="button" className={s.close} onClick={onClose}>Cancel</button>
              <h2 className={s.title}>{title}</h2>
              <div className={s.action}>{action}</div>
            </header>
            <div className={s.body}>{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
