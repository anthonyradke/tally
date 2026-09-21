import { useRef } from 'react'
import { Check } from 'lucide-react'
import type { Account, Category, Txn } from '@/api/client'
import { Amount } from './Amount'
import { Mark } from './Mark'
import { categoryVisual } from '@/icons/categories'
import { bankColor } from '@/icons/banks'
import { rowAmount } from '@/lib/txn'
import { isFuture } from '@/lib/dates'
import type { MarkSpec } from '@/icons/merchants'
import s from './TxnRow.module.css'

interface Props {
  t: Txn
  cat: Category
  from?: Account
  to?: Account
  today: string
  onClick?: () => void
  /** Long-press (touch) or right-click (pointer) — enters multi-select. */
  onLongPress?: () => void
  /** undefined = not in selection mode; boolean = this row's state. */
  selected?: boolean
  /** Merchant mark (resolved once by the list); null = category glyph. */
  mark: MarkSpec | null
  /** Just saved: flash once. */
  flash?: boolean
}

function AcctTag({ a }: { a: Account }) {
  return (
    <span className={s.acct}>
      <i className={`${s.dot} ${a.kind === 'card' ? s.filled : ''}`} style={{ '--c': bankColor(a) } as React.CSSProperties} />
      {a.name}
    </span>
  )
}

export function TxnRow({ t, cat, from, to, today, onClick, onLongPress, selected, mark: merchant, flash }: Props) {
  const vis = categoryVisual(cat)
  const amt = rowAmount(cat.type, t.amount)
  const future = isFuture(t.date, today)
  const timer = useRef<number | null>(null)
  const fired = useRef(false)
  const origin = useRef<{ x: number; y: number } | null>(null)

  const down = (e: React.PointerEvent) => {
    if (!onLongPress) return
    fired.current = false
    origin.current = { x: e.clientX, y: e.clientY }
    timer.current = window.setTimeout(() => { fired.current = true; onLongPress() }, 450)
  }
  const cancel = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  // Moving more than a few px is a scroll or a swipe, not a press.
  const move = (e: React.PointerEvent) => { if (origin.current && Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 8) cancel() }
  const click = () => { if (fired.current) { fired.current = false; return } onClick?.() }

  return (
    <button type="button" className={`${s.row} ${future ? s.future : ''} ${selected ? s.selected : ''} ${flash ? s.flash : ''}`} onClick={click}
      onPointerDown={down} onPointerMove={move} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
      onContextMenu={(e) => { if (onLongPress) { e.preventDefault(); onLongPress() } }}
      aria-pressed={selected === undefined ? undefined : selected}>
      {selected !== undefined ? (
        <span className={`${s.check} ${selected ? s.checkOn : ''}`} aria-hidden>{selected && <Check strokeWidth={3} absoluteStrokeWidth />}</span>
      ) : merchant ? <Mark spec={merchant} /> : <Mark Icon={vis.Icon} color={vis.color} />}
      <span className={s.text}>
        <span className={s.title}>{t.what || cat.name}{t.split_group && <span className={s.splitTag}>split</span>}</span>
        <span className={`secondary ${s.sub}`}>
          <span>{cat.name}</span>
          {from && <><span className={s.sep}>·</span><AcctTag a={from} /></>}
          {to && <><span className={s.sep}>{from ? '→' : '·'}</span><AcctTag a={to} /></>}
          {t.tags.length > 0 && <span className={s.tags}>{t.tags.map((x) => `#${x}`).join(' ')}</span>}
        </span>
      </span>
      <span className={`${s.right} ${amt.muted ? s.muted : ''}`}>
        <Amount cents={amt.cents} sign={amt.sign} tone={amt.tone} />
        {future && <span className={`caps ${s.flag}`}>upcoming</span>}
        {!future && t.receipt && <span className={`caps ${s.flag}`}>receipt</span>}
      </span>
    </button>
  )
}
