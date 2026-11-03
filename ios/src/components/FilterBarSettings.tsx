// Settings > Activity filters: which chip rows sit above Activity's list, their order, and the chips in each.
import { useState } from 'react'
import { Switch, View } from 'react-native'
import { Icon } from '@/components/Icon'
import { Group, Row } from '@/components/Row'
import { Tap } from '@/components/Tap'
import { useAdmin, write } from '@/lib/admin'
import { api } from '@/lib/api'
import { barChips, barRows, moveChip, movable, moveRow, parseBar, ROW_NAMES, toggleChip, toggleRow, type BarRow, type Saved } from '@/lib/filterBar'
import { useTally } from '@/lib/tally'
import { space, useTheme } from '@/theme'

export function FilterBarSettings() {
  const t = useTally()
  const admin = useAdmin()
  // Switches and moves show at once; the save follows, and a refusal puts the saved setting back.
  const [local, setLocal] = useState<Saved | null>(null)
  const b = t.b
  if (!b) return null
  const s = local ?? parseBar(admin.data?.settings.activity_filters ?? b.settings.activity_filters)
  const save = (next: Saved) => {
    setLocal(next)
    write(() => api.putSettings({ activity_filters: next })).then((ok) => { if (!ok) setLocal(null) })
  }
  const rows = barRows(s)
  return (
    <>
      <Group header="Rows" footer="Each row's first chip, like All or Any account, is always there and lets go of that filter.">
        {rows.map((r, i) => (
          <Row key={r.id} label={ROW_NAMES[r.id as BarRow]} chevron={false}
            trailing={<Controls up={i > 0 ? () => save(moveRow(s, i)) : null} on={r.on} set={(on) => save(toggleRow(s, r.id, on))} />} />
        ))}
      </Group>
      {rows.filter((r) => r.on).map((r) => {
        const row = r.id as BarRow
        const chips = barChips(s, row, b)
        if (!chips.length) return null
        return (
          <Group key={row} header={ROW_NAMES[row]}
            footer={row === 'account' ? 'In the order set in Settings > Accounts. Hidden accounts never show.' : row === 'category' ? 'In the order set in Settings > Categories. Hidden categories never show.' : undefined}>
            {chips.map((c, i) => (
              <Row key={c.id} label={c.label} chevron={false}
                trailing={<Controls up={movable(row) && i > 0 ? () => save(moveChip(s, row, b, i)) : movable(row) ? null : undefined} on={c.on}
                  set={(on) => save(toggleChip(s, row, c.id, on))} />} />
            ))}
          </Group>
        )
      })}
    </>
  )
}

/** A move-up button (dimmed at the top, left out where order is fixed) and an on/off switch. */
function Controls({ up, on, set }: { up?: (() => void) | null; on: boolean; set: (on: boolean) => void }) {
  const { c } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
      {up !== undefined && (
        <Tap feedback="opacity" hitSlop={6} disabled={!up} accessibilityLabel="Move up" onPress={() => up?.()}
          style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center', opacity: up ? 1 : 0.3 }}>
          <Icon sf="chevron.up" md="expand_less" size={12} color={c.label} weight="bold" />
        </Tap>
      )}
      <Switch value={on} onValueChange={set} />
    </View>
  )
}
