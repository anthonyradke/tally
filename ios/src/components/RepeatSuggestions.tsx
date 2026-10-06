// Settings → Recurring: entries that look like they repeat but have no template yet (lib/repeats.ts). Tapping one opens
// the recurring editor filled in, so nothing is added until you save; the X hides a suggestion for good.
import { useEffect, useMemo, useState } from 'react'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Haptics from 'expo-haptics'
import { categoryVisual } from '@/icons/categories'
import type { Bootstrap } from '@/lib/api'
import { useAllTxns } from '@/lib/balances'
import { dayLabel } from '@/lib/dates'
import { dollarsText } from '@/lib/forms'
import { formatCents } from '@/lib/money'
import { findRepeats, type Repeat } from '@/lib/repeats'
import { useTheme } from '@/theme'
import { Icon } from './Icon'
import { Mark } from './Mark'
import { Group, Row } from './Row'
import { Tap } from './Tap'

const HIDDEN = 'tally.repeats.hidden'
const FREQ = { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', yearly: 'Yearly' }
const keyOf = (r: Repeat) => `${r.category_id}|${r.what.toLowerCase()}`

export function RepeatSuggestions({ b }: { b: Bootstrap }) {
  const { c, tint } = useTheme()
  const all = useAllTxns()
  const [hidden, setHidden] = useState<string[] | null>(null)
  useEffect(() => {
    AsyncStorage.getItem(HIDDEN).then((v) => setHidden(v ? JSON.parse(v) : [])).catch(() => setHidden([]))
  }, [])
  const found = useMemo(() => (all.data ? findRepeats(all.data.items, b.recurring, b.today) : []), [all.data, b.recurring, b.today])
  if (!hidden) return null
  const list = found.filter((r) => !hidden.includes(keyOf(r))).slice(0, 5)
  if (!list.length) return null
  const hide = (r: Repeat) => {
    Haptics.selectionAsync().catch(() => {})
    const next = [...hidden, keyOf(r)]
    setHidden(next)
    AsyncStorage.setItem(HIDDEN, JSON.stringify(next.slice(-200))).catch(() => {})
  }
  const open = (r: Repeat) => router.push({ pathname: '/edit', params: { kind: 'recurring', prefill: JSON.stringify({
    label: r.what, what: r.what, category_id: r.category_id, from_account_id: r.from_id, to_account_id: r.to_id,
    amount: dollarsText(r.amount), freq: r.freq, next_date: r.next }) } })
  return (
    <Group header="Looks like it repeats" footer="From entries with the same name, accounts and amount on a steady schedule. Tap one to set it up; nothing is added until you save.">
      {list.map((r) => {
        const cat = b.categories.find((x) => x.id === r.category_id)
        const v = cat ? categoryVisual(cat) : null
        return (
          <Row key={keyOf(r)} label={r.what} sub={`${FREQ[r.freq]}, ${formatCents(r.amount)}, next ${dayLabel(r.next, b.today)}`} onPress={() => open(r)}
            leading={v ? <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={30} /> : undefined}
            trailing={
              <Tap feedback="opacity" onPress={() => hide(r)} hitSlop={10} accessibilityLabel={`Not recurring: ${r.what}`}>
                <Icon sf="xmark.circle.fill" md="cancel" size={20} color={c.label3} />
              </Tap>
            } />
        )
      })}
    </Group>
  )
}
