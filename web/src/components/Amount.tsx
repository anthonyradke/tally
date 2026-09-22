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
  /** Also roll up from zero on mount. */
  rollIn?: boolean
  className?: string
}

const DIGITS = '0123456789'

// Advance width of each digit (in em, letter-spacing included) per size, measured once from the real font. A rolling
// column is exactly as wide as the digit it shows, so rolled figures space identically to static text.
const widths = new Map<string, number[]>()
function digitWidths(size: AmountSize): number[] {
  const hit = widths.get(size)
  if (hit) return hit
  const probe = document.createElement('span')
  probe.className = `${s.amount} ${s[size]}`
  probe.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:0'
  probe.innerHTML = [...DIGITS].map((d) => `<span class="${s.ch}">${d}</span>`).join('')
  document.body.appendChild(probe)
  const px = parseFloat(getComputedStyle(probe).fontSize) || 16
  const w = [...probe.children].map((c) => (c as HTMLElement).getBoundingClientRect().width / px)
  probe.remove()
  if (w.every((x) => x > 0)) widths.set(size, w)
  return w
}

/** Digit advance widths (em) for whatever font an element uses, e.g. a number field's. */
export function digitWidthsOf(el: Element): number[] {
  const cs = getComputedStyle(el)
  const key = `${cs.font}|${cs.fontVariantNumeric}|${cs.letterSpacing}`
  const hit = widths.get(key)
  if (hit) return hit
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:0;white-space:nowrap'
  Object.assign(probe.style, { font: cs.font, fontVariantNumeric: cs.fontVariantNumeric, letterSpacing: cs.letterSpacing })
  probe.innerHTML = [...DIGITS].map((d) => `<span style="display:inline-block">${d}</span>`).join('')
  document.body.appendChild(probe)
  const px = parseFloat(cs.fontSize) || 16
  const w = [...probe.children].map((c) => (c as HTMLElement).getBoundingClientRect().width / px)
  probe.remove()
  if (w.every((x) => x > 0)) widths.set(key, w)
  return w
}

/** Text with each digit on a 0-9 column translated by transform. `widths` (em per digit) keep the spacing of static text. */
export function Rolling({ text, widths: w, rollIn = false }: { text: string; widths: number[]; rollIn?: boolean }) {
  const chars = [...text]
  return chars.map((ch, i) => {
    // key from the right so a new leading digit doesn't re-roll every column
    const key = `${chars.length - i}`
    if (!/\d/.test(ch)) return <span key={key} className={s.ch} aria-hidden>{ch}</span>
    const d = Number(ch)
    return (
      <span key={key} className={s.col} style={{ width: `${w[d]}em` }} aria-hidden>
        <motion.span
          className={s.stack}
          initial={rollIn ? { transform: 'translateY(0%)' } : false}
          animate={{ transform: `translateY(-${d * 10}%)` }}
          transition={{ type: 'spring', stiffness: rollIn ? 140 : 320, damping: rollIn ? 22 : 38, mass: 0.8, delay: rollIn ? 0.05 * i : 0 }}
        >
          {[...DIGITS].map((n) => <span key={n} className={s.digit}>{n}</span>)}
        </motion.span>
      </span>
    )
  })
}

/** Tabular figures; optional rolling-digit animation. */
export function Amount({ cents, size = 'body', showCents = true, sign = 'auto', tone = 'auto', roll = false, rollIn = false, className }: Props) {
  const reduce = useReducedMotion()
  const text = formatCents(cents, { cents: showCents, sign })
  const toneCls = tone === 'auto' ? (cents < 0 ? s.neg : '') : tone === 'pos' ? s.pos : tone === 'neg' ? s.neg : ''
  const chars = [...text]

  return (
    <span className={`${s.amount} ${s[size]} ${toneCls} ${className ?? ''}`} aria-label={text}>
      {roll && !reduce
        ? <Rolling text={text} widths={digitWidths(size)} rollIn={rollIn} />
        : chars.map((ch, i) => <span key={`${chars.length - i}`} className={s.ch} aria-hidden>{ch}</span>)}
    </span>
  )
}
