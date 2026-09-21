import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import s from './Panel.module.css'

/** A titled section: section title, optional "See all ›", then its content (usually a Panel). */
export function Section({ title, action = 'See all', onAction, children, className }: { title: ReactNode; action?: string; onAction?: () => void; children: ReactNode; className?: string }) {
  return (
    <section className={`${s.section} ${className ?? ''}`}>
      <header className={s.head}>
        <h2 className="section-title">{title}</h2>
        {onAction && <button type="button" className={s.action} onClick={onAction}>{action}<ChevronRight strokeWidth={2.25} absoluteStrokeWidth /></button>}
      </header>
      {children}
    </section>
  )
}

/** Solid grouped surface (Home + Insights only; DESIGN.md). Pressable when given onClick. */
export function Panel({ children, onClick, className, flush }: { children: ReactNode; onClick?: () => void; className?: string; flush?: boolean }) {
  const cls = `${s.panel} ${flush ? s.flush : ''} ${className ?? ''}`
  if (!onClick) return <div className={cls}>{children}</div>
  return (
    <button type="button" className={`${cls} ${s.press}`} onClick={onClick}>
      {children}
    </button>
  )
}
