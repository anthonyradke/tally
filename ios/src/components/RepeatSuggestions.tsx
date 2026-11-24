// Settings → Recurring: entries that look like they repeat but have no template yet (lib/repeats.ts). Tapping one opens
// the recurring editor filled in, so nothing is added until you save; the X hides a suggestion for good.
import { useEffect, useMemo, useState } from 'react'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { scoped } from '@/lib/server'
import * as Haptics from 'expo-haptics'
import { categoryVisual } from '@/icons/categories'
import type { Bootstrap } from '@/lib/api'
import { useAllTxns } from '@/lib/balances'
import { nextDue } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { findRepeats, repeatPrefill, type Repeat } from '@/lib/repeats'
import { FREQ_LABEL } from '@/lib/txn'
import { useTheme } from '@/theme'
import { Icon } from './Icon'
import { Mark } from './Mark'
import { Group, Row } from './Row'
import { Tap } from './Tap'

const HIDDEN = 'tally.repeats.hidden'
const keyOf = (r: Repeat) => `${r.category_id}|${r.what.toLowerCase()}`

/** `folded`: one row ("3 more look like they repeat") that opens the list, for under the templates, where keeping them
 *  up is the main job. Five suggestions above them used to push the real bills off the screen. */
export function RepeatSuggestions({ b, folded }: { b: Bootstrap; folded?: boolean }) {
  const { c, tint } = useTheme()
  const all = useAllTxns()
  const [hidden, setHidden] = useState<string[] | null>(null)
  const [open, setOpen] = useState(!folded)
  useEffect(() => {
    AsyncStorage.getItem(scoped(HIDDEN)).then((v) => setHidden(v ? JSON.parse(v) : [])).catch(() => setHidden([]))
  }, [])
  const found = useMemo(() => (all.data ? findRepeats(all.data.items, b.recurring, b.today) : []), [all.data, b.recurring, b.today])
  if (!hidden) return null
  const list = found.filter((r) => !hidden.includes(keyOf(r))).slice(0, 5)
  if (!list.length) return null
  const hide = (r: Repeat) => {
    Haptics.selectionAsync().catch(() => {})
    const next = [...hidden, keyOf(r)]
    setHidden(next)
    AsyncStorage.setItem(scoped(HIDDEN), JSON.stringify(next.slice(-200))).catch(() => {})
  }
  // A hidden account in the suggestion is swapped or left to pick, and the editor says so (lib/repeats.ts).
  const setUp = (r: Repeat) => {
    const { fields, note } = repeatPrefill(r, b.accounts)
    router.push({ pathname: '/edit', params: { kind: 'recurring', prefill: JSON.stringify(fields), ...(note ? { note } : {}) } })
  }
  if (!open) {
    return (
      <Group>
        <Row label={list.length === 1 ? '1 more looks like it repeats' : `${list.length} more look like they repeat`} sf="wand.and.stars" md="auto_fix_high" chevron={false}
          trailing={<Icon sf="chevron.down" md="expand_more" size={13} color={c.label3} weight="bold" />} onPress={() => { Haptics.selectionAsync().catch(() => {}); setOpen(true) }} />
      </Group>
    )
  }
  return (
    <Group header="Looks like it repeats" footer="From entries with the same name, accounts and amount on a steady schedule. Tap one to set it up; nothing is added until you save.">
      {list.map((r) => {
        const cat = b.categories.find((x) => x.id === r.category_id)
        const v = cat ? categoryVisual(cat) : null
        return (
          <Row key={keyOf(r)} label={r.what} sub={`${FREQ_LABEL[r.freq]}, ${formatCents(r.amount)}, ${nextDue(r.next, b.today)}`} onPress={() => setUp(r)}
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
