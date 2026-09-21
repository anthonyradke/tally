import { useRef, useState, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react'
import { Copy, Trash2 } from 'lucide-react'
import s from './SwipeRow.module.css'

interface Props { children: ReactNode; onDelete: () => void; onDuplicate?: () => void; disabled?: boolean }

/** Swipe left to reveal Duplicate / Delete under a row. Snaps open or shut; a tap on an open row closes it.
 *  Hand-rolled pointer tracking instead of Motion's `drag`: that feature measures every row on mount, which forced
 *  one layout per row and cost a long task whenever a long list appeared. */
export function SwipeRow({ children, onDelete, onDuplicate, disabled }: Props) {
  const x = useMotionValue(0)
  // Actions stay invisible until the row actually moves, so they never show through a row that's fading in
  // and no sub-pixel sliver of the red button peeks out under a resting row.
  const reveal = useTransform(x, (v) => (v < -0.5 ? 1 : 0))
  const [open, setOpen] = useState(false)
  // The action buttons only exist while the row is off its resting position: long lists mount far fewer nodes.
  const [armed, setArmed] = useState(false)
  useMotionValueEvent(x, 'change', (v) => { if (v < -0.5 && !armed) setArmed(true) })
  const dragged = useRef(false)
  const g = useRef<{ x0: number; y0: number; base: number; lock: 'x' | 'y' | null; lastX: number; lastT: number; vx: number } | null>(null)
  const W = onDuplicate ? 160 : 80

  const settle = (to: number) => {
    animate(x, to, { type: 'spring', stiffness: 520, damping: 42, onComplete: () => { if (to === 0) setArmed(false) } })
    setOpen(to !== 0)
  }
  const down = (e: React.PointerEvent) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return
    dragged.current = false
    g.current = { x0: e.clientX, y0: e.clientY, base: x.get(), lock: null, lastX: e.clientX, lastT: e.timeStamp, vx: 0 }
  }
  const move = (e: React.PointerEvent) => {
    const st = g.current
    if (!st) return
    const dx = e.clientX - st.x0, dy = e.clientY - st.y0
    if (!st.lock) {
      if (Math.hypot(dx, dy) < 8) return
      st.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (st.lock === 'x') { dragged.current = true; e.currentTarget.setPointerCapture(e.pointerId) }
    }
    if (st.lock !== 'x') return
    let v = st.base + dx
    if (v > 0) v *= 0.04
    else if (v < -W) v = -W + (v + W) * 0.04
    x.set(v)
    const dt = e.timeStamp - st.lastT
    if (dt > 0) st.vx = (e.clientX - st.lastX) / dt
    st.lastX = e.clientX; st.lastT = e.timeStamp
  }
  const up = () => {
    const st = g.current
    g.current = null
    if (st?.lock === 'x') settle(x.get() < -W / 2 || st.vx < -0.4 ? -W : 0)
  }

  return (
    <div className={s.wrap}>
      {armed && <motion.div className={s.actions} style={{ opacity: reveal }} aria-hidden={!open}>
        {onDuplicate && <button type="button" tabIndex={open ? 0 : -1} className={s.dup} onClick={() => { settle(0); onDuplicate() }}><Copy strokeWidth={2} absoluteStrokeWidth />Duplicate</button>}
        <button type="button" tabIndex={open ? 0 : -1} className={s.del} onClick={() => { settle(0); onDelete() }}><Trash2 strokeWidth={2} absoluteStrokeWidth />Delete</button>
      </motion.div>}
      <motion.div className={s.content} style={{ x }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClickCapture={(e) => {
          // The click that ends a swipe is swallowed; a later tap on an open row closes it instead of opening the entry.
          if (dragged.current) { e.stopPropagation(); e.preventDefault(); dragged.current = false }
          else if (open) { e.stopPropagation(); e.preventDefault(); settle(0) }
        }}>
        {children}
      </motion.div>
    </div>
  )
}
