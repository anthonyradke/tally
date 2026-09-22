import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Reorder } from 'motion/react'
import { GripVertical, Settings as SettingsIcon, SlidersHorizontal } from 'lucide-react'
import { api } from '@/api/client'
import { useBootstrap, useLookups, useTransactions } from '@/lib/data'
import { useAdd } from '@/lib/add'
import { usePace } from '@/lib/pace'
import { Sheet } from '@/components/Sheet'
import { DEFAULT_LAYOUT, parseLayout, WIDGETS, type Layout, type WidgetId } from './HomeWidgets'
import s from './Home.module.css'

const LS = 'money.home_layout'

export function Home() {
  const boot = useBootstrap()
  const lookups = useLookups(boot.data)
  const upcoming = useTransactions({ start: boot.data?.today, dir: 'asc', limit: 20 }, !!boot.data)
  const recent = useTransactions({ end: boot.data?.today, limit: 5 }, !!boot.data)
  const pace = usePace(boot.data)
  const add = useAdd()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  // Layout: server setting wins; localStorage makes the first paint match before bootstrap lands.
  const [layout, setLayout] = useState<Layout>(() => parseLayout(localStorage.getItem(LS) ?? undefined))
  useEffect(() => { if (boot.data?.settings.home_layout) setLayout(parseLayout(boot.data.settings.home_layout)) }, [boot.data?.settings.home_layout])
  const persist = useMutation({ mutationFn: (l: Layout) => api.putSettings({ home_layout: l }), onSuccess: () => qc.invalidateQueries({ queryKey: ['bootstrap'] }) })
  const update = (l: Layout) => { setLayout(l); localStorage.setItem(LS, JSON.stringify(l)); persist.mutate(l) }

  const b = boot.data
  if (!b) return <div className={s.screen} />
  const cur = b.months[b.months.length - 1]
  const prev = b.months[b.months.length - 2]
  const ctx = { b, lookups, cur, prev, nav, add, upcoming: (upcoming.data?.items ?? []).filter((t) => t.date > b.today).slice(0, 5), recent: recent.data?.items ?? [], pace }

  return (
    <div className={s.screen}>
      <div className={s.tools}>
        <button type="button" className={s.gear} onClick={() => setEditing(true)} aria-label="Edit Home"><SlidersHorizontal strokeWidth={1.75} absoluteStrokeWidth /></button>
        <button type="button" className={`${s.gear} ${s.gearPhone}`} onClick={() => nav('/settings')} aria-label="Settings"><SettingsIcon strokeWidth={1.75} absoluteStrokeWidth /></button>
      </div>
      {layout.order.filter((id) => !layout.hidden.includes(id)).map((id) => [id, WIDGETS[id].render(ctx)] as const).filter(([, node]) => node).map(([id, node]) => <div key={id}>{node}</div>)}

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit Home" action={<button type="button" className={s.done} onClick={() => setEditing(false)}>Done</button>}>
        <p className={`secondary ${s.editHint}`}>Drag to reorder. Switch off what you don't want to see.</p>
        <Reorder.Group axis="y" values={layout.order} onReorder={(order) => update({ ...layout, order: order as WidgetId[] })} className={s.reorder} as="div">
          {layout.order.map((id) => (
            <Reorder.Item key={id} value={id} as="div" className={s.dragRow}>
              <GripVertical className={s.grip} strokeWidth={2} absoluteStrokeWidth />
              <span className={s.dragText}><span>{WIDGETS[id].label}</span><span className="secondary">{WIDGETS[id].hint}</span></span>
              <input type="checkbox" className={s.switch} checked={!layout.hidden.includes(id)} aria-label={`Show ${WIDGETS[id].label}`}
                onChange={(e) => update({ ...layout, hidden: e.target.checked ? layout.hidden.filter((x) => x !== id) : [...layout.hidden, id] })} />
            </Reorder.Item>
          ))}
        </Reorder.Group>
        <button type="button" className={s.resetBtn} onClick={() => update(DEFAULT_LAYOUT)}>Reset to default</button>
      </Sheet>
    </div>
  )
}
