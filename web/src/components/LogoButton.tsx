import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useBootstrap } from '@/lib/data'
import { MARK_OPTIONS, merchantKey, merchantMark, overrideKey, parseOverrides, specFor } from '@/icons/merchants'
import { TINTS } from '@/icons/glyphs'
import type { Visual } from '@/icons/categories'
import { Mark } from './Mark'
import { Picker, type Option } from './Picker'
import s from './LogoButton.module.css'

/** The mark beside "What" in the Add sheet. Tap to pick a logo for this merchant; it applies to every entry with that name. */
export function LogoButton({ what, fallback }: { what: string; fallback?: Visual }) {
  const boot = useBootstrap()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const o = parseOverrides(boot.data?.settings.merchant_marks)
  const key = merchantKey(what)
  const current = overrideKey(what, o)
  const save = useMutation({
    mutationFn: (value: string) => {
      const next = { ...o }
      if (current) delete next[current]
      if (value) next[key] = value
      return api.putSettings({ merchant_marks: next })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bootstrap'] }),
  })
  if (!key) return null

  const auto = merchantMark(what)
  const spec = current ? specFor(o[current], what) : auto
  const cat = fallback && <Mark Icon={fallback.Icon} color={fallback.color} size="sm" />
  const options: Option[] = [
    { value: '', label: 'Automatic', mark: auto ? <Mark spec={auto} size="sm" /> : cat, hint: auto?.title ?? 'Category icon' },
    { value: 'category', label: 'Category icon', mark: cat },
    ...TINTS.map((t) => ({ value: `tint:${t}`, label: `${t[0].toUpperCase()}${t.slice(1)} letter`, group: 'Letter tile', mark: <Mark spec={specFor(`tint:${t}`, what)!} size="sm" /> })),
    ...MARK_OPTIONS.map(({ id, spec }) => ({ value: id, label: spec.title, group: 'Brands', mark: <Mark spec={spec} size="sm" /> })),
  ]

  return (
    <>
      <button type="button" className={s.btn} onClick={(e) => { e.preventDefault(); setOpen(true) }} aria-label={`Logo for ${what}`}>
        {spec ? <Mark spec={spec} size="sm" /> : cat}
      </button>
      <Picker open={open} onClose={() => setOpen(false)} title={`Logo for “${key}”`} options={options} searchable
        value={current ? o[current] : ''} onChange={(v) => save.mutate(v)} />
    </>
  )
}
