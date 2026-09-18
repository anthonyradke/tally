import type { ButtonHTMLAttributes, ReactNode } from 'react'
import s from './Chip.module.css'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  leading?: ReactNode
  trailing?: ReactNode
  size?: 'md' | 'sm'
}

/** Pill button for filters and quick actions. Selected = ink. */
export function Chip({ selected, leading, trailing, size = 'md', className, children, ...rest }: Props) {
  return (
    <button type="button" aria-pressed={selected} className={`${s.chip} ${s[size]} ${selected ? s.on : ''} ${className ?? ''}`} {...rest}>
      {leading && <span className={s.lead}>{leading}</span>}
      <span className={s.label}>{children}</span>
      {trailing && <span className={s.trail}>{trailing}</span>}
    </button>
  )
}

export function ChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`${s.row} no-scrollbar ${className ?? ''}`}>{children}</div>
}
