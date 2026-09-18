import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Amount, type Tone } from './Amount'
import s from './Hero.module.css'

interface Props {
  label: string
  cents: number
  tone?: Tone
  showCents?: boolean
  /** Small element to the right of the figure (delta chip, period picker). */
  trailing?: ReactNode
  /** Line under the figure (e.g. "of $13,270 goal"). */
  sub?: ReactNode
  /** 0–1 fills the ledger rule from the left. Omit for a plain rule. */
  progress?: number
  compact?: boolean
}

/** The signature: one big live figure sitting on a 2px ink rule. */
export function Hero({ label, cents, tone = 'auto', showCents = true, trailing, sub, progress, compact }: Props) {
  return (
    <header className={`${s.hero} ${compact ? s.compact : ''}`}>
      <div className="caps">{label}</div>
      <div className={s.row}>
        <Amount cents={cents} size={compact ? 'title' : 'display'} tone={tone} showCents={showCents} roll />
        {trailing && <div className={s.trailing}>{trailing}</div>}
      </div>
      {sub && <div className={`secondary ${s.sub}`}>{sub}</div>}
      <div
        className={`${s.rule} ${progress !== undefined ? s.track : ''}`}
        role={progress !== undefined ? 'progressbar' : undefined}
        aria-valuenow={progress !== undefined ? Math.round(progress * 100) : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {progress !== undefined && (
          <motion.i
            className={s.fill}
            initial={false}
            animate={{ scaleX: Math.max(0.005, Math.min(1, progress)) }}
            transition={{ type: 'spring', stiffness: 120, damping: 24 }}
          />
        )}
      </div>
    </header>
  )
}
