import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { formatCents } from '@/lib/money'
import s from './LineChart.module.css'

export interface Point { x: string; y: number }

interface Props {
  points: Point[]
  /** Series color (a mark color, never used for text). Defaults to ink. */
  color?: string
  height?: number
  xLabel: (x: string) => string
  ariaLabel: string
}

/** Clean tick values: 3–4 steps of 1/2/5 × 10ⁿ spanning the data (zero included when it's near). */
function ticks(min: number, max: number): number[] {
  if (min > 0 && min < max * 0.4) min = 0
  if (max < 0 && max > min * 0.4) max = 0
  const span = Math.max(max - min, 1)
  const raw = span / 3
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((k) => k * pow).find((v) => v >= raw) ?? pow * 10
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = lo; v <= hi + 1e-9; v += step) out.push(Math.round(v))
  return out
}

const PAD = { top: 22, right: 12, bottom: 22, left: 0 }

/** Single-series line: 2px round line, 10% area wash, hairline grid, endpoint label, crosshair tooltip, table twin. */
export function LineChart({ points, color = 'var(--fg)', height = 160, xLabel, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const geo = useMemo(() => {
    if (!points.length || !width) return null
    const ys = points.map((p) => p.y)
    const tk = ticks(Math.min(...ys), Math.max(...ys))
    const yMin = tk[0], yMax = tk[tk.length - 1]
    const w = width - PAD.left - PAD.right, h = height - PAD.top - PAD.bottom
    const X = (i: number) => PAD.left + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w)
    const Y = (v: number) => PAD.top + h - ((v - yMin) / Math.max(yMax - yMin, 1)) * h
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('')
    const area = `${line}L${X(points.length - 1).toFixed(1)},${(PAD.top + h).toFixed(1)}L${X(0).toFixed(1)},${(PAD.top + h).toFixed(1)}Z`
    return { tk, X, Y, line, area, h, w }
  }, [points, width, height])

  const pick = (clientX: number) => {
    if (!geo || !ref.current) return
    const x = clientX - ref.current.getBoundingClientRect().left
    let best = 0, dist = Infinity
    points.forEach((_, i) => { const d = Math.abs(geo.X(i) - x); if (d < dist) { dist = d; best = i } })
    setHover(best)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? points.length - 1) - 1))
    if (e.key === 'ArrowRight') setHover((h) => Math.min(points.length - 1, (h ?? points.length - 1) + 1))
    if (e.key === 'Escape') setHover(null)
  }

  const last = points[points.length - 1]
  const idx = hover ?? points.length - 1
  const tipLeft = geo ? Math.min(Math.max(geo.X(idx), 60), width - 60) : 0

  return (
    <figure className={s.fig} aria-label={ariaLabel}>
      <div ref={ref} className={s.plot} style={{ height }} tabIndex={0} role="img" aria-label={`${ariaLabel}: ${points.map((p) => `${xLabel(p.x)} ${formatCents(p.y, { cents: false })}`).join(', ')}`}
        onPointerMove={(e) => pick(e.clientX)} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onBlur={() => setHover(null)}>
        {geo && (
          <svg width={width} height={height} className={s.svg} aria-hidden>
            {geo.tk.map((v) => <line key={v} x1={PAD.left} x2={width - PAD.right} y1={geo.Y(v)} y2={geo.Y(v)} className={s.grid} />)}
            {geo.tk.map((v) => <text key={`t${v}`} x={width - PAD.right} y={geo.Y(v) - 4} className={s.tick} textAnchor="end">{formatCents(v, { cents: false })}</text>)}
            <motion.path d={geo.area} fill={color} className={s.area} initial={false} animate={{ opacity: 0.1 }} />
            <motion.path d={geo.line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} />
            {hover !== null && <line x1={geo.X(hover)} x2={geo.X(hover)} y1={PAD.top} y2={PAD.top + geo.h} className={s.cross} />}
            <circle cx={geo.X(idx)} cy={geo.Y(points[idx].y)} r={6} className={s.ring} />
            <circle cx={geo.X(idx)} cy={geo.Y(points[idx].y)} r={4} fill={color} />
            {hover === null && last && (
              <text x={geo.X(points.length - 1)} y={geo.Y(last.y) - 12} className={s.endLabel} textAnchor="end">{formatCents(last.y, { cents: false })}</text>
            )}
          </svg>
        )}
        {hover !== null && geo && (
          <div className={s.tip} style={{ left: tipLeft, top: Math.max(0, geo.Y(points[hover].y) - 56) }} role="status">
            <strong className="tnum">{formatCents(points[hover].y)}</strong>
            <span className="secondary">{xLabel(points[hover].x)}</span>
          </div>
        )}
      </div>
      <div className={s.xaxis} aria-hidden>
        <span>{points.length ? xLabel(points[0].x) : ''}</span>
        {points.length > 1 && <span>{xLabel(last.x)}</span>}
      </div>
      <details className={s.tableWrap}>
        <summary className="secondary">Show as table</summary>
        <table className={`tnum ${s.table}`}>
          <tbody>{points.map((p) => <tr key={p.x}><td>{xLabel(p.x)}</td><td>{formatCents(p.y)}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  )
}
