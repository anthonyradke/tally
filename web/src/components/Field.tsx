import type { InputHTMLAttributes, ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import s from './Field.module.css'

/** Inset grouped list — the iOS Settings idiom. Rows separated by hairlines, one surface. */
export function FieldGroup({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <section className={s.section}>
      {title && <h3 className={`caps ${s.title}`}>{title}</h3>}
      <div className={s.group}>{children}</div>
    </section>
  )
}

interface RowProps { label: string; value?: ReactNode; placeholder?: string; mark?: ReactNode; onClick?: () => void; trailing?: ReactNode; hint?: string }

/** Tappable row: label left, current value right, chevron. Opens a Picker or a sub-sheet. */
export function FieldRow({ label, value, placeholder = 'Choose', mark, onClick, trailing, hint }: RowProps) {
  const body = (
    <>
      <span className={s.label}>{label}</span>
      <span className={`${s.value} ${value ? '' : s.placeholder}`}>{mark}<span className={s.valueText}>{value ?? placeholder}</span></span>
      {trailing ?? (onClick && <ChevronRight className={s.chev} strokeWidth={2} absoluteStrokeWidth />)}
    </>
  )
  return (
    <div className={s.rowWrap}>
      {onClick ? <button type="button" className={s.row} onClick={onClick}>{body}</button> : <div className={s.row}>{body}</div>}
      {hint && <div className={`secondary ${s.hint}`}>{hint}</div>}
    </div>
  )
}

interface TextProps extends InputHTMLAttributes<HTMLInputElement> { label: string; suggestions?: string[]; onPick?: (v: string) => void; trailing?: ReactNode }

/** Label + inline text input. */
export function TextRow({ label, suggestions, onPick, className, trailing, ...rest }: TextProps) {
  return (
    <div className={s.rowWrap}>
      <label className={s.row}>
        <span className={s.label}>{label}</span>
        <input className={`${s.input} ${className ?? ''}`} {...rest} />
        {trailing}
      </label>
      {suggestions && suggestions.length > 0 && (
        <div className={`${s.suggest} no-scrollbar`}>
          {suggestions.map((sg) => <button key={sg} type="button" className={s.sugg} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick?.(sg)}>{sg}</button>)}
        </div>
      )}
    </div>
  )
}

export function ToggleRow({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className={s.rowWrap}>
      <label className={s.row}>
        <span className={s.label} style={{ flex: 1 }}>{label}</span>
        <input type="checkbox" className={s.switch} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </label>
      {hint && <div className={`secondary ${s.hint}`}>{hint}</div>}
    </div>
  )
}
