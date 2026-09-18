import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, Search } from 'lucide-react'
import { Sheet } from './Sheet'
import s from './Picker.module.css'

export interface Option { value: string; label: string; group?: string; mark?: ReactNode; hint?: string }

interface Props {
  open: boolean
  onClose: () => void
  title: string
  options: Option[]
  value: string | null
  onChange: (value: string) => void
  searchable?: boolean
  /** Adds a first option that clears the value, labelled with this text. */
  noneLabel?: string
}

/** Option list in a sheet: grouped, searchable, with identity marks. Replaces native <select>. */
export function Picker({ open, onClose, title, options, value, onChange, searchable, noneLabel }: Props) {
  const [q, setQ] = useState('')
  useEffect(() => { if (!open) setQ('') }, [open])
  const list = useMemo(() => {
    const all = noneLabel ? [{ value: '', label: noneLabel } as Option, ...options] : options
    const needle = q.trim().toLowerCase()
    return needle ? all.filter((o) => o.label.toLowerCase().includes(needle)) : all
  }, [options, q, noneLabel])

  let group: string | undefined
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {searchable && (
        <label className={s.search}>
          <Search className={s.searchIcon} strokeWidth={2} absoluteStrokeWidth />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" autoComplete="off" />
        </label>
      )}
      <div className={s.list} role="listbox" aria-label={title}>
        {list.map((o) => {
          const head = o.group && o.group !== group ? (group = o.group) : null
          const on = (value ?? '') === o.value
          return (
            <div key={o.value || '__none'}>
              {head && <div className={`caps ${s.group}`}>{head}</div>}
              <button type="button" role="option" aria-selected={on} className={`${s.opt} ${on ? s.on : ''}`}
                onClick={() => { onChange(o.value); onClose() }}>
                {o.mark && <span className={s.mark}>{o.mark}</span>}
                <span className={s.label}>{o.label}</span>
                {o.hint && <span className={`secondary ${s.hint}`}>{o.hint}</span>}
                {on && <Check className={s.check} strokeWidth={2.5} absoluteStrokeWidth />}
              </button>
            </div>
          )
        })}
        {list.length === 0 && <p className={`secondary ${s.empty}`}>No matches.</p>}
      </div>
    </Sheet>
  )
}
