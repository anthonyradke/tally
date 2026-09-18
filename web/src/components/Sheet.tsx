import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react'
import { useMediaQuery } from '@/lib/useMediaQuery'
import s from './Sheet.module.css'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Right-side header action, e.g. a Save button. */
  action?: ReactNode
  /** Pinned below the scrolling body (the keypad). */
  footer?: ReactNode
  /** Full-height sheet (Add entry); default sizes to content. */
  tall?: boolean
}

// Sheets nest (a Picker over the Add sheet). Only the top one answers Escape, and the page stays inert
// until the last one closes.
const stack: Array<() => void> = []
let keyBound = false
function bindKeys() {
  if (keyBound) return
  keyBound = true
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stack.length) stack[stack.length - 1]() })
}

/** Bottom sheet on phones (spring in, drag the header down to dismiss); centered dialog from 720px up. */
export function Sheet({ open, onClose, title, children, action, footer, tall }: Props) {
  const wide = useMediaQuery('(min-width: 720px)')
  const coarse = useMediaQuery('(pointer: coarse)')
  const reduce = useReducedMotion()
  const panel = useRef<HTMLDivElement>(null)
  const restore = useRef<Element | null>(null)
  const drag = useDragControls()

  useEffect(() => {
    if (!open) return
    bindKeys()
    stack.push(onClose)
    restore.current = document.activeElement
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => {
      // Phones: never focus an input on open (it would raise the keyboard over the sheet).
      const first = panel.current?.querySelector<HTMLElement>(coarse ? '[autofocus]' : '[autofocus], input, button')
      ;(first ?? panel.current)?.focus({ preventScroll: true })
    })
    return () => {
      stack.splice(stack.lastIndexOf(onClose), 1)
      if (stack.length === 0) { root?.removeAttribute('inert'); document.body.style.overflow = '' }
      ;(restore.current as HTMLElement | null)?.focus?.({ preventScroll: true })
    }
  }, [open, onClose, coarse])

  const variants = wide
    ? { hidden: { opacity: 0, scale: 0.96 }, shown: { opacity: 1, scale: 1 } }
    : { hidden: { y: '100%' }, shown: { y: 0 } }
  const transition = reduce
    ? { duration: 0 }
    : wide ? { duration: 0.24, ease: [0.2, 0.8, 0.2, 1] as const } : { type: 'spring' as const, stiffness: 420, damping: 42, mass: 0.9 }
  const draggable = !wide && !reduce

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
            drag={draggable ? 'y' : false} dragListener={false} dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => { if (info.offset.y > 120 || info.velocity.y > 700) onClose() }}
          >
            {/* Only the handle area starts a dismiss drag, so the body scrolls natively. */}
            <div className={s.handle} onPointerDown={(e) => { if (draggable) drag.start(e) }}>
              {!wide && <div className={s.grabber} aria-hidden />}
              <header className={s.header}>
                <button type="button" className={s.close} onClick={onClose}>Cancel</button>
                <h2 className={s.title}>{title}</h2>
                <div className={s.action}>{action}</div>
              </header>
            </div>
            <div className={s.body}>{children}</div>
            {footer && <div className={s.footer}>{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
