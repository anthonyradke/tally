import { useRef, useState, type ReactNode } from 'react'
import { animate, motion, useMotionValue } from 'motion/react'
import { Copy, Trash2 } from 'lucide-react'
import s from './SwipeRow.module.css'

interface Props { children: ReactNode; onDelete: () => void; onDuplicate?: () => void; disabled?: boolean }

/** Swipe left to reveal Duplicate / Delete under a row. Snaps open or shut; a tap on an open row closes it. */
export function SwipeRow({ children, onDelete, onDuplicate, disabled }: Props) {
  const x = useMotionValue(0)
  const [open, setOpen] = useState(false)
  const dragged = useRef(false)
  const W = onDuplicate ? 160 : 80
  const settle = (to: number) => { animate(x, to, { type: 'spring', stiffness: 520, damping: 42 }); setOpen(to !== 0) }
  return (
    <div className={s.wrap}>
      <div className={s.actions} aria-hidden={!open}>
        {onDuplicate && <button type="button" tabIndex={open ? 0 : -1} className={s.dup} onClick={() => { settle(0); onDuplicate() }}><Copy strokeWidth={2} absoluteStrokeWidth />Duplicate</button>}
        <button type="button" tabIndex={open ? 0 : -1} className={s.del} onClick={() => { settle(0); onDelete() }}><Trash2 strokeWidth={2} absoluteStrokeWidth />Delete</button>
      </div>
      <motion.div className={s.content} style={{ x }} drag={disabled ? false : 'x'} dragDirectionLock dragMomentum={false}
        dragConstraints={{ left: -W, right: 0 }} dragElastic={0.04}
        onDragStart={() => { dragged.current = true }}
        onDragEnd={(_, info) => settle(x.get() < -W / 2 || info.velocity.x < -400 ? -W : 0)}
        onClickCapture={(e) => { if (dragged.current || open) { e.stopPropagation(); e.preventDefault(); dragged.current = false; if (open) settle(0) } }}>
        {children}
      </motion.div>
    </div>
  )
}
