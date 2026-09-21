import { useEffect, type ReactNode } from 'react'
import { Amount, type Tone } from './Amount'
import { ProgressBar } from './ProgressBar'
import s from './Hero.module.css'

interface Props {
  label: ReactNode
  cents: number
  tone?: Tone
  showCents?: boolean
  /** Small element to the right of the figure (delta pill, period picker). */
  trailing?: ReactNode
  /** Line under the figure (e.g. "of $13,270 goal"). */
  sub?: ReactNode
  /** 0–1 draws a meter under the figure. */
  progress?: number
  compact?: boolean
}

// Hero figures roll up from zero once per app launch (the first screen shown), then only on change.
let launched = false

/** One big live figure: sentence-case label, rolling digits, optional delta and meter. */
export function Hero({ label, cents, tone = 'auto', showCents = true, trailing, sub, progress, compact }: Props) {
  const rollIn = !launched
  useEffect(() => { launched = true }, [])
  return (
    <header className={`${s.hero} ${compact ? s.compact : ''}`}>
      <div className={s.label}>{label}</div>
      <div className={s.row}>
        <Amount cents={cents} size={compact ? 'title' : 'display'} tone={tone} showCents={showCents} roll rollIn={rollIn} />
        {trailing && <div className={s.trailing}>{trailing}</div>}
      </div>
      {sub && <div className={`secondary ${s.sub}`}>{sub}</div>}
      {progress !== undefined && <div className={s.meter}><ProgressBar value={progress} label={typeof label === 'string' ? label : 'Progress'} /></div>}
    </header>
  )
}
