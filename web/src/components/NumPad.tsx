import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Delete } from 'lucide-react'
import s from './NumPad.module.css'

type Kind = 'money' | 'amount' | 'whole'

// iOS's own number pad moves the whole installed app every time it opens, even for a field far above it, and leaves
// the window short when it closes (lib/keyboard.ts). So on phones number fields ask for no keyboard at all and this
// pad slides up instead. On a computer they stay plain fields.
//   money:  dollars that can go negative (balances), with a ± key
//   amount: positive decimals (budgets, rates, quick action amounts)
//   whole:  whole numbers (months)
const coarse = () => matchMedia('(pointer: coarse)').matches

/** Props for a number field: Tally's pad on phones, the system keyboard elsewhere. */
export function numpad(kind: Kind = 'amount') {
  return { inputMode: coarse() ? 'none' : kind === 'whole' ? 'numeric' : 'decimal', 'data-numpad': kind } as const
}

const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!

/** Type into a controlled input the way the keyboard would, so React's onChange fires. */
function type(el: HTMLInputElement, next: string) {
  setValue.call(el, next)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function press(el: HTMLInputElement, kind: Kind, key: string) {
  const v = el.value
  if (key === 'back') return type(el, v.slice(0, -1))
  if (key === 'sign') return type(el, v.startsWith('-') ? v.slice(1) : `-${v}`)
  if (key === '.') return v.includes('.') ? undefined : type(el, (v === '' || v === '-' ? `${v}0` : v) + '.')
  if (/\.\d{2,}$/.test(v) && kind !== 'whole') return // cents are as fine as it gets
  type(el, v === '0' ? key : v === '-0' ? `-${key}` : v + key)
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']

export function NumPad() {
  const [el, setEl] = useState<HTMLInputElement | null>(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    const on = (e: FocusEvent) => {
      const t = e.target
      setEl(t instanceof HTMLInputElement && t.dataset.numpad && t.inputMode === 'none' ? t : null)
    }
    // Focus moving to a non-field (or nowhere) closes the pad; the keys themselves never take focus.
    const off = () => window.setTimeout(() => {
      const a = document.activeElement
      if (!(a instanceof HTMLInputElement && a.dataset.numpad && a.inputMode === 'none')) setEl(null)
    }, 0)
    document.addEventListener('focusin', on)
    document.addEventListener('focusout', off)
    return () => { document.removeEventListener('focusin', on); document.removeEventListener('focusout', off) }
  }, [])
  // A field that unmounts while focused (its sheet closed) never fires focusout.
  useEffect(() => {
    if (!el) return
    const id = window.setInterval(() => { if (!el.isConnected) setEl(null) }, 250)
    return () => window.clearInterval(id)
  }, [el])

  const kind = (el?.dataset.numpad ?? 'amount') as Kind
  return createPortal(
    <AnimatePresence>
      {el && (
        <motion.div className={s.dock} role="group" aria-label="Number pad"
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 46, mass: 0.8 }}
          onPointerDown={(e) => e.preventDefault()}>
          <div className={s.bar}>
            {kind === 'money'
              ? <button type="button" className={s.barBtn} onClick={() => press(el, kind, 'sign')} aria-label="Toggle negative">±</button>
              : <span />}
            <button type="button" className={`${s.barBtn} ${s.done}`} onClick={() => el.blur()}>Done</button>
          </div>
          <div className={s.keys}>
            {KEYS.map((k) => k === '.' && kind === 'whole' ? <span key={k} /> : (
              <button key={k} type="button" className={s.key} onClick={() => press(el, kind, k)} aria-label={k === 'back' ? 'Delete' : k}>
                {k === 'back' ? <Delete className={s.icon} strokeWidth={2} absoluteStrokeWidth /> : k}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
