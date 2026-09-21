import { useRef } from 'react'
import { motion, useInView } from 'motion/react'
import s from './ProgressBar.module.css'

/** Rounded meter. Fills once when it first scrolls into view, then follows changes. */
export function ProgressBar({ value, color = 'var(--fg)', label }: { value: number; color?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useInView(ref, { once: true, margin: '0px 0px -10% 0px' })
  const v = Math.max(0, Math.min(1, value))
  return (
    <div ref={ref} className={s.track} role="progressbar" aria-label={label} aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}
      style={{ '--c': color } as React.CSSProperties}>
      <motion.i className={s.fill} initial={{ scaleX: 0 }} animate={{ scaleX: seen ? Math.max(v, 0.012) : 0 }}
        transition={{ type: 'spring', stiffness: 90, damping: 20, delay: 0.05 }} />
    </div>
  )
}
