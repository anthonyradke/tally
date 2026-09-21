import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import s from './ScrubChart.module.css'

interface Props {
  /** Values for slots 0..n-1 (n may be shorter than `slots`, e.g. days so far this month). */
  series: number[]
  /** Optional comparison series across all slots (last month), drawn dashed. */
  compare?: number[]
  slots: number
  height?: number
  color?: string
  startLabel?: string
  endLabel?: string
  ariaLabel: string
  /** Called with the slot under the finger/pointer, or null on release. */
  onScrub?: (i: number | null) => void
}

const PAD = { top: 10, bottom: 10, x: 6 }

/** The signature chart (DESIGN.md "The scrub"): no axes, drag anywhere to move the cursor; the parent rolls its figure. */
export function ScrubChart({ series, compare, slots, height = 120, color = 'var(--fg)', startLabel, endLabel, ariaLabel, onScrub }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [at, setAt] = useState<number | null>(null)
  const down = useRef(false)
  const reduce = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const geo = useMemo(() => {
    if (!width || !series.length) return null
    const all = [...series, ...(compare ?? [])]
    const max = Math.max(...all, 1) * 1.08, min = Math.min(0, ...all)
    const w = width - PAD.x * 2, h = height - PAD.top - PAD.bottom
    const X = (i: number) => PAD.x + (slots <= 1 ? w / 2 : (i / (slots - 1)) * w)
    const Y = (v: number) => PAD.top + h - ((v - min) / (max - min || 1)) * h
    const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')
    const line = path(series)
    const area = `${line}L${X(series.length - 1).toFixed(1)},${Y(min).toFixed(1)}L${X(0).toFixed(1)},${Y(min).toFixed(1)}Z`
    return { X, Y, line, area, cmp: compare?.length ? path(compare) : null }
  }, [width, height, series, compare, slots])

  const set = (i: number | null) => { if (i !== at) { setAt(i); onScrub?.(i) } }
  const pick = (clientX: number) => {
    if (!geo || !ref.current) return
    const x = clientX - ref.current.getBoundingClientRect().left
    const i = Math.round(((x - PAD.x) / Math.max(1, width - PAD.x * 2)) * (slots - 1))
    set(Math.max(0, Math.min(series.length - 1, i)))
  }
  const onKey = (e: React.KeyboardEvent) => {
    const cur = at ?? series.length - 1
    if (e.key === 'ArrowLeft') set(Math.max(0, cur - 1))
    else if (e.key === 'ArrowRight') set(Math.min(series.length - 1, cur + 1))
    else if (e.key === 'Escape') set(null)
  }
  const end = () => { down.current = false; set(null) }
  const i = at ?? series.length - 1

  return (
    <div className={s.wrap}>
      <div ref={ref} className={s.plot} style={{ height }} tabIndex={0} role="img" aria-label={ariaLabel}
        onPointerDown={(e) => { down.current = true; pick(e.clientX) }}
        onPointerMove={(e) => { if (down.current || e.pointerType === 'mouse') pick(e.clientX) }}
        onPointerUp={(e) => { if (e.pointerType !== 'mouse') end(); else down.current = false }}
        onPointerLeave={end} onPointerCancel={end} onKeyDown={onKey} onBlur={() => set(null)}>
        {geo && (
          <svg width={width} height={height} className={s.svg} aria-hidden>
            {geo.cmp && <path d={geo.cmp} className={s.cmp} />}
            <motion.path d={geo.area} fill={color} initial={{ opacity: 0 }} animate={{ opacity: 0.08 }} transition={{ duration: 0.6 }} />
            <motion.path d={geo.line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }} />
            {at !== null && <line x1={geo.X(i)} x2={geo.X(i)} y1={0} y2={height} className={s.cursor} />}
            {at !== null && compare?.[i] !== undefined && <circle cx={geo.X(i)} cy={geo.Y(compare[i])} r={3.5} className={s.cmpDot} />}
            <circle cx={geo.X(i)} cy={geo.Y(series[i])} r={at !== null ? 9 : 7} fill={color} opacity={0.16} />
            <circle cx={geo.X(i)} cy={geo.Y(series[i])} r={4.5} fill={color} className={s.dot} />
          </svg>
        )}
      </div>
      {(startLabel || endLabel) && <div className={s.axis} aria-hidden><span>{startLabel}</span><span>{endLabel}</span></div>}
    </div>
  )
}
