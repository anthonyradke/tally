import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Bookmark, Landmark, Plus, Search, Settings, Tag } from 'lucide-react'
import { useBootstrap } from '@/lib/data'
import { useAdd } from '@/lib/add'
import { categoryVisual } from '@/icons/categories'
import { Mark } from './Mark'
import s from './Palette.module.css'

interface Cmd { id: string; label: string; hint?: string; icon: React.ReactNode; run: () => void }

/** ⌘K / Ctrl+K on desktop: jump anywhere, add an entry, run a quick action, filter Activity, search. */
export function Palette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const nav = useNavigate()
  const add = useAdd()
  const boot = useBootstrap()

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); setQ(''); setI(0) }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])
  useEffect(() => { if (open) requestAnimationFrame(() => input.current?.focus()) }, [open])

  const cmds = useMemo<Cmd[]>(() => {
    const b = boot.data
    const go = (to: string) => () => nav(to)
    const list: Cmd[] = [
      { id: 'new', label: 'New entry', hint: 'Enter', icon: <Plus />, run: () => add.open() },
      { id: 'home', label: 'Home', icon: <ArrowRight />, run: go('/') },
      { id: 'activity', label: 'Activity', icon: <ArrowRight />, run: go('/activity') },
      { id: 'accounts', label: 'Accounts', icon: <ArrowRight />, run: go('/accounts') },
      { id: 'insights', label: 'Insights', icon: <ArrowRight />, run: go('/insights') },
      { id: 'settings', label: 'Settings', icon: <Settings />, run: go('/settings') },
    ]
    if (b) {
      for (const f of b.favorites) { const c = b.categories.find((x) => x.id === f.category_id); const v = c && categoryVisual(c); list.push({ id: `fav${f.id}`, label: `Add: ${f.label}`, icon: v ? <Mark Icon={v.Icon} color={v.color} size="sm" /> : <Plus />, run: () => add.open({ favorite: f }) }) }
      for (const a of b.accounts) list.push({ id: `acct${a.id}`, label: `Open ${a.name}`, icon: <Landmark />, run: go(`/accounts/${a.id}`) })
      for (const c of b.categories) { const v = categoryVisual(c); list.push({ id: `cat${c.id}`, label: `Filter: ${c.name}`, icon: <Mark Icon={v.Icon} color={v.color} size="sm" />, run: go(`/activity?category=${c.id}`) }) }
      for (const v of b.saved_views) list.push({ id: `view${v.id}`, label: `View: ${v.name}`, icon: <Bookmark />, run: go(`/activity?${v.query}`) })
      list.push({ id: 'budgets', label: 'Categories & budgets', icon: <Tag />, run: go('/settings/categories') })
    }
    return list
  }, [boot.data, nav, add])

  const needle = q.trim().toLowerCase()
  const shown = useMemo(() => {
    const hits = needle ? cmds.filter((c) => c.label.toLowerCase().includes(needle)) : cmds
    const out = hits.slice(0, 10)
    if (needle) out.unshift({ id: 'search', label: `Search “${q.trim()}”`, hint: 'Activity', icon: <Search />, run: () => nav(`/activity?q=${encodeURIComponent(q.trim())}`) })
    return out
  }, [cmds, needle, q, nav])

  const run = (c: Cmd) => { setOpen(false); c.run() }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(shown.length - 1, x + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)) }
    else if (e.key === 'Enter' && shown[i]) run(shown[i])
    else if (e.key === 'Escape') setOpen(false)
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={s.root}>
          <motion.div className={s.scrim} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} onClick={() => setOpen(false)} />
          <motion.div role="dialog" aria-label="Commands" className={`glass-rim ${s.box}`} initial={{ opacity: 0, scale: 0.97, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}>
            <div className={s.inputRow}><Search className={s.searchIcon} strokeWidth={2} absoluteStrokeWidth />
              <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setI(0) }} onKeyDown={onKey} placeholder="Type a command, a merchant, an account…" aria-label="Command" autoComplete="off" /></div>
            <ul className={s.list} role="listbox">
              {shown.map((c, idx) => (
                <li key={c.id}><button type="button" role="option" aria-selected={idx === i} className={`${s.item} ${idx === i ? s.on : ''}`} onMouseEnter={() => setI(idx)} onClick={() => run(c)}>
                  <span className={s.icon}>{c.icon}</span><span className={s.label}>{c.label}</span>{c.hint && <kbd className={s.kbd}>{c.hint}</kbd>}
                </button></li>
              ))}
              {shown.length === 0 && <li className={`secondary ${s.empty}`}>Nothing matches.</li>}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
