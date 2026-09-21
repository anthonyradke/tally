import { Delete } from 'lucide-react'
import s from './Keypad.module.css'

export type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'back' | 'neg'
const KEYS: Key[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'neg', '0', 'back']

/** Decimal-shift keypad: typing 5 3 6 7 reads $53.67. `neg` toggles sign (refunds, corrections). */
export function Keypad({ onKey, negative }: { onKey: (k: Key) => void; negative?: boolean }) {
  return (
    <div className={s.pad} role="group" aria-label="Amount keypad">
      {KEYS.map((k) => (
        <button key={k} type="button" className={`${s.key} ${k === 'neg' && negative ? s.on : ''} ${k !== 'neg' && k !== 'back' ? s.digit : ''}`}
          onPointerDown={(e) => e.preventDefault()} onClick={() => onKey(k)}
          aria-label={k === 'back' ? 'Delete' : k === 'neg' ? 'Toggle negative' : k}>
          {k === 'back' ? <Delete className={s.icon} strokeWidth={2} absoluteStrokeWidth /> : k === 'neg' ? '±' : k}
        </button>
      ))}
    </div>
  )
}

/** Apply a key to a digit string (cents, no separators). Caps at 9 digits = $9,999,999.99. */
export function applyKey(digits: string, k: Key): string {
  if (k === 'back') return digits.slice(0, -1)
  if (k === 'neg') return digits
  if (digits.length >= 9) return digits
  const next = digits + k
  return next.replace(/^0+(?=\d)/, '')
}
