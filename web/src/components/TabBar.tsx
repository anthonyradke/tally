import { NavLink } from 'react-router'
import { motion } from 'motion/react'
import { ChartColumn, House, Landmark, Plus, ReceiptText, Settings } from 'lucide-react'
import { useAdd } from '@/lib/add'
import s from './TabBar.module.css'

const LEFT = [
  { to: '/', label: 'Home', Icon: House, end: true },
  { to: '/activity', label: 'Activity', Icon: ReceiptText, end: false },
]
const RIGHT = [
  { to: '/accounts', label: 'Accounts', Icon: Landmark, end: false },
  { to: '/insights', label: 'Insights', Icon: ChartColumn, end: false },
]
const SPRING = { type: 'spring' as const, stiffness: 520, damping: 44, mass: 0.8 }

function Tab({ to, label, Icon, end, className }: (typeof LEFT)[number] & { className?: string }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `${s.tab} ${className ?? ''} ${isActive ? s.on : ''}`}>
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="tab-highlight" className={s.highlight} transition={SPRING} aria-hidden />}
          <span className={s.iconWrap}>
            <Icon className={s.icon} strokeWidth={1.75} absoluteStrokeWidth />
          </span>
          <span className={s.label}>{label}</span>
        </>
      )}
    </NavLink>
  )
}

/** Thumb-zone bottom bar on phones; left rail from 900px. The centre Add is the app's primary action. */
export function TabBar() {
  const { open } = useAdd()
  return (
    <nav className={`glass ${s.bar}`} aria-label="Primary">
      <div className={s.brand} aria-hidden>Tally</div>
      {LEFT.map((t) => <Tab key={t.to} {...t} />)}
      <button type="button" className={s.add} onClick={() => open()} aria-label="Add entry">
        <Plus className={s.plus} strokeWidth={2.25} absoluteStrokeWidth />
        <span className={s.addLabel}>New entry</span>
      </button>
      {RIGHT.map((t) => <Tab key={t.to} {...t} />)}
      <Tab to="/settings" label="Settings" Icon={Settings} end={false} className={s.railOnly} />
    </nav>
  )
}
