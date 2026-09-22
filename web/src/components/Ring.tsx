import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useInView, useReducedMotion } from 'motion/react'
import s from './Ring.module.css'

export interface Slice { key: string; value: number; color: string }

// Rings that already drew this launch mount drawn when their page is revisited (see ProgressBar).
const drawn = new Set<string>()

/** Donut of shares. Each slice draws in once per launch, in order, when the ring first scrolls into view. */
export function Ring({ slices, size = 168, thickness = 16, children, label }: { slices: Slice[]; size?: number; thickness?: number; children?: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [again] = useState(() => drawn.has(label))
  const inView = useInView(ref, { once: true })
  const seen = again || inView
  useEffect(() => { if (inView) drawn.add(label) }, [inView, label])
  const reduce = useReducedMotion()
  const total = slices.reduce((n, x) => n + Math.max(0, x.value), 0) || 1
  const r = (size - thickness) / 2
  const gap = slices.length > 1 ? 0.012 : 0
  let at = 0
  return (
    <div ref={ref} className={s.ring} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={s.svg}>
        <circle cx={size / 2} cy={size / 2} r={r} className={s.track} strokeWidth={thickness} fill="none" />
        {slices.map((x, i) => {
          const frac = Math.max(0, x.value) / total
          const start = at
          at += frac
          const len = Math.max(0.001, frac - gap)
          return (
            <motion.circle key={x.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={x.color} strokeWidth={thickness} strokeLinecap="butt"
              initial={again ? false : { pathLength: 0, pathOffset: start }}
              animate={seen ? { pathLength: len, pathOffset: start } : { pathLength: 0, pathOffset: start }}
              transition={reduce ? { duration: 0 } : { duration: 0.5, delay: 0.08 + i * 0.06, ease: [0.2, 0.8, 0.2, 1] }} />
          )
        })}
      </svg>
      {children && <div className={s.center}>{children}</div>}
    </div>
  )
}
