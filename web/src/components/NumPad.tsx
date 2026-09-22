import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Keypad, act, applyKey, type Key } from './Keypad'
import { Rolling, digitWidthsOf } from './Amount'
import s from './NumPad.module.css'

type Kind = 'money' | 'amount' | 'rate' | 'whole'

// iOS's own number pad moves the whole installed app every time it opens, even for a field far above it, and leaves
// the window short when it closes (lib/keyboard.ts). So on phones number fields ask for no keyboard at all and New
// entry's keypad slides up instead, typing the same way: digits shift in from the right (5 3 6 7 reads 53.67).
//   money:  dollars that can go negative (balances), with the ± key
//   amount: positive dollars and percentages, 2 places
//   rate:   loan rates, 3 places
//   whole:  whole numbers (months)
// On a computer they stay plain fields.
const PLACES: Record<Kind, number> = { money: 2, amount: 2, rate: 3, whole: 0 }
const coarse = () => matchMedia('(pointer: coarse)').matches

/** Props for a number field: Tally's keypad on phones, the system keyboard elsewhere. */
export function numpad(kind: Kind = 'amount') {
  return { inputMode: coarse() ? 'none' : kind === 'whole' ? 'numeric' : 'decimal', 'data-numpad': kind } as const
}

const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!

/** Type into a controlled input the way the keyboard would, so React's onChange fires. */
function type(el: HTMLInputElement, next: string) {
  setValue.call(el, next)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function press(el: HTMLInputElement, kind: Kind, k: Key) {
  const places = PLACES[kind]
  const v = el.value.trim()
  const neg = v.startsWith('-')
  const n = Math.abs(Number(v.replace(/[^\d.]/g, '')) || 0)
  const digits = n ? String(Math.round(n * 10 ** places)) : ''
  const next = k === 'neg' ? digits : applyKey(digits, k)
  const body = next === '' ? '' : places ? (Number(next) / 10 ** places).toFixed(places) : next
  type(el, ((k === 'neg' ? !neg : neg) ? '-' : '') + body)
}

const isPadField = (t: EventTarget | null): t is HTMLInputElement =>
  t instanceof HTMLInputElement && !!t.dataset.numpad && t.inputMode === 'none'

function scroller(el: HTMLElement) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement)
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p
  return null
}

/** The field's value with rolling digits, drawn over the field (whose own text goes clear) while the pad types into it. */
function Roller({ el }: { el: HTMLInputElement }) {
  const [text, setText] = useState(el.value)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    setText(el.value)
    const on = () => setText(el.value)
    el.addEventListener('input', on)
    return () => el.removeEventListener('input', on)
  }, [el])
  // Hide the field's text only while there is some, so its placeholder still shows when empty.
  useLayoutEffect(() => {
    const keep = { color: el.style.color, fill: el.style.webkitTextFillColor, caret: el.style.caretColor }
    el.style.color = text ? 'transparent' : keep.color
    el.style.webkitTextFillColor = text ? 'transparent' : keep.fill
    el.style.caretColor = 'transparent'
    return () => { el.style.color = keep.color; el.style.webkitTextFillColor = keep.fill; el.style.caretColor = keep.caret }
  }, [el, text])
  // Follow the field every frame: the sheet scrolls it into place as the pad comes up.
  useLayoutEffect(() => {
    const o = box.current
    if (!o) return
    const cs = getComputedStyle(el)
    Object.assign(o.style, {
      font: cs.font, fontVariantNumeric: cs.fontVariantNumeric, letterSpacing: cs.letterSpacing, color: cs.color,
      justifyContent: /right|end/.test(cs.textAlign) ? 'flex-end' : cs.textAlign === 'center' ? 'center' : 'flex-start',
    })
    const inset = { l: parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), r: parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth) }
    const clip = scroller(el)
    let raf = 0
    const tick = () => {
      const r = el.getBoundingClientRect()
      const c = clip?.getBoundingClientRect()
      Object.assign(o.style, {
        left: `${r.left + inset.l}px`, top: `${r.top}px`, width: `${r.width - inset.l - inset.r}px`, height: `${r.height}px`,
        clipPath: c ? `inset(${Math.max(0, c.top - r.top)}px 0 ${Math.max(0, r.bottom - c.bottom)}px 0)` : '',
      })
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [el])
  return <span ref={box} className={s.roller} aria-hidden><Rolling text={text} widths={digitWidthsOf(el)} /></span>
}

export function NumPad() {
  const [el, setEl] = useState<HTMLInputElement | null>(null)
  const [neg, setNeg] = useState(false)
  const reduce = useReducedMotion()
  useEffect(() => {
    const on = (e: FocusEvent) => setEl(isPadField(e.target) ? e.target : null)
    // Focus moving to a non-field (or nowhere) closes the pad; the keys themselves never take focus.
    const off = () => window.setTimeout(() => { if (!isPadField(document.activeElement)) setEl(null) }, 0)
    document.addEventListener('focusin', on)
    document.addEventListener('focusout', off)
    return () => { document.removeEventListener('focusin', on); document.removeEventListener('focusout', off) }
  }, [])
  useEffect(() => {
    if (!el) return
    const sync = () => setNeg(el.value.trim().startsWith('-'))
    sync()
    el.addEventListener('input', sync)
    // A field that unmounts while focused (its sheet closed) never fires focusout.
    const id = window.setInterval(() => { if (!el.isConnected) setEl(null) }, 250)
    return () => { el.removeEventListener('input', sync); window.clearInterval(id) }
  }, [el])

  const kind = (el?.dataset.numpad ?? 'amount') as Kind
  return createPortal(
    <>
      {el && !reduce && <Roller el={el} />}
      <AnimatePresence>
        {el && (
          <motion.div className={s.dock} role="group" aria-label="Number pad"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 46, mass: 0.8 }}
            onPointerDown={(e) => e.preventDefault()} onTouchEnd={(e) => e.preventDefault()}>
            <div className={s.bar}>
              <button type="button" className={s.done} {...act(() => el.blur())}>Done</button>
            </div>
            <Keypad onKey={(k) => press(el, kind, k)} negative={neg} signed={kind === 'money'} />
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  )
}
