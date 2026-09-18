import { motion, useReducedMotion } from 'motion/react'
import { formatCents, type Sign } from '@/lib/money'
import s from './Amount.module.css'

export type AmountSize = 'display' | 'title' | 'body' | 'small'
export type Tone = 'auto' | 'neutral' | 'pos' | 'neg'

interface Props {
  cents: number
  size?: AmountSize
  showCents?: boolean
  sign?: Sign
  tone?: Tone
  /** Roll digits on change (the hero moment). Off for dense lists. */
  roll?: boolean
  className?: string
}

const DIGITS = '0123456789'

/** Tabular figures; optional rolling-digit animation. Each digit is a 10-row column translated by transform. */
export function Amount({ cents, size = 'body', showCents = true, sign = 'auto', tone = 'auto', roll = false, className }: Props) {
  const reduce = useReducedMotion()
  const text = formatCents(cents, { cents: showCents, sign })
  const toneCls = tone === 'auto' ? (cents < 0 ? s.neg : '') : tone === 'pos' ? s.pos : tone === 'neg' ? s.neg : ''
  const chars = [...text]

  return (
    <span className={`${s.amount} ${s[size]} ${toneCls} ${className ?? ''}`} aria-label={text}>
      {chars.map((ch, i) => {
        // key from the right so a new leading digit doesn't re-roll every column
        const key = `${chars.length - i}`
        if (!roll || reduce || !/\d/.test(ch)) return <span key={key} className={s.ch} aria-hidden>{ch}</span>
        const d = Number(ch)
        return (
          <span key={key} className={s.col} aria-hidden>
            <motion.span
              className={s.stack}
              initial={false}
              animate={{ y: `-${d * 10}%` }}
              transition={{ type: 'spring', stiffness: 320, damping: 38, mass: 0.8 }}
            >
              {[...DIGITS].map((n) => <span key={n} className={s.digit}>{n}</span>)}
            </motion.span>
          </span>
        )
      })}
    </span>
  )
}
