import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { MarkSpec } from '@/icons/merchants'
import s from './Mark.module.css'

type Size = 'sm' | 'md' | 'lg'
type Props = { size?: Size; className?: string } & (
  | { Icon: LucideIcon; color: string; spec?: undefined }
  | { spec: MarkSpec; Icon?: undefined; color?: undefined }
)

/** Identity tile: a category glyph, a brand glyph, or a monogram, in its tint on a translucent tint background. */
export function Mark(props: Props) {
  const size = props.size ?? 'md'
  const color = props.spec ? props.spec.color : props.color
  const style = { '--c': color } as CSSProperties
  return (
    <span className={`${s.mark} ${s[size]} ${props.className ?? ''}`} style={style} aria-hidden>
      {props.spec
        ? props.spec.kind === 'brand'
          ? <svg viewBox="0 0 24 24" className={s.brand}><path d={props.spec.path} fill="currentColor" /></svg>
          : <span className={s.mono}>{props.spec.letter}</span>
        : <props.Icon className={s.glyph} strokeWidth={2} absoluteStrokeWidth />}
    </span>
  )
}
