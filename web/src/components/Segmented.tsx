import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import s from './Segmented.module.css'

interface Props<T extends string> { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void; label: string; id: string }

/** iOS segmented control with a sliding thumb. Scrolls sideways when there are more options than fit. */
export function Segmented<T extends string>({ options, value, onChange, label, id }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }) }, [value])
  return (
    <div ref={ref} className={`${s.bar} no-scrollbar`} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} className={`${s.opt} ${on ? s.on : ''}`} onClick={() => onChange(o.value)}>
            {on && <motion.span layoutId={`seg-${id}`} className={s.thumb} transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            <span className={s.text}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
