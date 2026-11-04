// Settings > Activity filters: which chip rows sit above Activity's list, their order, and the chips in each. Rows and
// chips drag to reorder, like Settings > Accounts.
import { useState, type ReactNode } from 'react'
import { Switch } from 'react-native'
import { DragGroup } from '@/components/DragGroup'
import { Row } from '@/components/Row'
import { useAdmin, write } from '@/lib/admin'
import { api } from '@/lib/api'
import { barChips, barRows, orderChips, orderRows, parseBar, ROW_NAMES, toggleChip, toggleRow, type BarRow, type Saved } from '@/lib/filterBar'
import { useTally } from '@/lib/tally'

const FOOT: Partial<Record<BarRow, string>> = {
  account: 'Starts in the order set in Settings > Accounts. Hidden accounts never show.',
  category: 'Starts in the order set in Settings > Categories. Hidden categories never show.',
}

export function FilterBarSettings({ reorder }: { reorder: boolean }) {
  const t = useTally()
  const admin = useAdmin()
  // Switches and drags show at once; the save follows, and a refusal puts the saved setting back.
  const [local, setLocal] = useState<Saved | null>(null)
  const b = t.b
  if (!b) return null
  const s = local ?? parseBar(admin.data?.settings.activity_filters ?? b.settings.activity_filters)
  const save = (next: Saved) => {
    setLocal(next)
    return write(() => api.putSettings({ activity_filters: next })).then((ok) => { if (!ok) setLocal(null); return ok })
  }
  const rows = barRows(s)
  return (
    <>
      <DragGroup header="Rows" footer="Each row's first chip, like All or Any account, is always there and lets go of that filter."
        items={rows} keyOf={(r) => r.id} handles={reorder} onReorder={(next) => save(orderRows(s, next.map((r) => r.id)))}
        render={(r, handle) => (
          <Row label={ROW_NAMES[r.id as BarRow]} chevron={false}
            trailing={handle ?? <Switch value={r.on} onValueChange={(on) => { save(toggleRow(s, r.id, on)) }} />} />
        )} />
      {rows.filter((r) => r.on).map((r) => {
        const row = r.id as BarRow
        const chips = barChips(s, row, b)
        if (!chips.length) return null
        const chip = (x: (typeof chips)[number], handle: ReactNode) => (
          <Row key={x.id} label={x.label} chevron={false}
            trailing={handle ?? <Switch value={x.on} onValueChange={(on) => { save(toggleChip(s, row, x.id, on)) }} />} />
        )
        return <DragGroup key={row} header={ROW_NAMES[row]} footer={FOOT[row]} items={chips} keyOf={(x) => x.id} handles={reorder}
          onReorder={(next) => save(orderChips(s, row, b, next.map((x) => x.id)))} render={chip} />
      })}
    </>
  )
}
