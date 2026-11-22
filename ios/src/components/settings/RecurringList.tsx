// Settings → Recurring: the templates first, each showing the next date that will happen, with swipe actions (Pause or
// Resume, Skip, Delete) that act at once with Undo. Entries that look like they repeat sit below, folded into one row.
import { useState, type ReactNode } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Mark } from '@/components/Mark'
import { RepeatSuggestions } from '@/components/RepeatSuggestions'
import { Group, Row } from '@/components/Row'
import { SwipeRow, type SwipeAction } from '@/components/SwipeRow'
import { categoryVisual } from '@/icons/categories'
import type { AdminData, AdminRecurring } from '@/lib/api'
import { commitments } from '@/lib/commitments'
import { nextDue } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { useBusy } from '@/lib/nav'
import { dueOf, removeRecurring, skipLabel, skipNext, togglePause } from '@/lib/recurringActions'
import { useTally } from '@/lib/tally'
import { useTheme } from '@/theme'

const FREQ = { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', yearly: 'Yearly' }

export function RecurringList({ a, empty }: { a: AdminData; empty: ReactNode }) {
  const { b } = useTally()
  if (!a.recurring.length) return <>{b && <RepeatSuggestions b={b} />}{empty}</>
  const k = b ? commitments(b) : null
  const list = [...a.recurring].sort((x, y) => (y.active - x.active) || dueOf(x).localeCompare(dueOf(y)))
  return (
    <>
      <Group footer={k && k.outMonthly ? `Bills and subscriptions add up to ${formatCents(k.outMonthly, { cents: false })} a month, ${formatCents(k.outMonthly * 12, { cents: false })} a year. Swipe one to pause, skip or delete it.` : 'Swipe one to pause, skip or delete it.'}>
        {list.map((r) => <RecurringRow key={r.id} r={r} a={a} />)}
      </Group>
      {b && <RepeatSuggestions b={b} folded />}
    </>
  )
}

function RecurringRow({ r, a }: { r: AdminRecurring; a: AdminData }) {
  const { c, tint } = useTheme()
  const { today } = useTally()
  const once = useBusy()
  const [attempt, setAttempt] = useState(0) // bumped when a delete fails, so the swiped-away row comes back
  const cat = a.categories.find((x) => x.id === r.category_id)
  const v = cat ? categoryVisual(cat) : null
  const open = () => router.push({ pathname: '/edit', params: { kind: 'recurring', id: String(r.id) } })
  const pause = () => { once(() => togglePause(r, today)) }
  const skip = () => { once(() => skipNext(r, today)) }
  const remove = () => { once(async () => { if (!(await removeRecurring(r))) setAttempt((n) => n + 1) }) }
  const right: SwipeAction[] = [
    r.active ? { label: 'Pause', sf: 'pause.fill', md: 'pause', color: '#FF9F0A', run: pause } : { label: 'Resume', sf: 'play.fill', md: 'play_arrow', color: '#34C759', run: pause },
    ...(r.active ? [{ label: 'Skip', sf: 'forward.end.fill', md: 'skip_next', color: '#0A84FF', run: skip } as SwipeAction] : []),
    { label: 'Delete', sf: 'trash', md: 'delete', color: '#FF3B30', run: remove, destructive: true },
  ]
  return (
    <View accessible accessibilityRole="button" accessibilityLabel={`${r.label}, ${formatCents(r.amount)}, ${r.active ? `${FREQ[r.freq]}, ${nextDue(dueOf(r), today)}` : 'paused'}`}
      accessibilityActions={[{ name: 'activate' }, { name: 'pause', label: r.active ? 'Pause' : 'Resume' }, ...(r.active ? [{ name: 'skip', label: skipLabel(r, today) }] : []), { name: 'delete', label: 'Delete' }]}
      onAccessibilityAction={(e) => {
        const n = e.nativeEvent.actionName
        if (n === 'activate') open(); else if (n === 'pause') pause(); else if (n === 'skip') skip(); else if (n === 'delete') remove()
      }}>
      <SwipeRow right={right} resetKey={`${r.id}:${r.active}:${attempt}`}>
        <View style={{ backgroundColor: c.panel }}>
          <Row label={r.label} sub={r.active ? `${FREQ[r.freq]}, ${nextDue(dueOf(r), today)}` : 'Paused'}
            value={formatCents(r.amount)} leading={v ? <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={30} /> : undefined}
            onPress={open} />
        </View>
      </SwipeRow>
    </View>
  )
}
