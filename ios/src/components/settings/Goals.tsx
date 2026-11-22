// Settings → Goals (emergency fund, Roth IRA) and Settings → Month end (where interest is logged). Each change saves
// at once and says so.
import { useState } from 'react'
import { TextInput, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { decimalPad, DoneBar } from '@/components/editor/Fields'
import { Icon } from '@/components/Icon'
import { Group, Row } from '@/components/Row'
import { Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { write } from '@/lib/admin'
import { api, type AdminData, type CatType } from '@/lib/api'
import { fromCents, toCents } from '@/lib/draft'
import { radius, space, useTheme } from '@/theme'

type Key = 'roth_category' | 'interest_category'

/** One category setting as a list with a tick. The tick moves on tap; the save catches up behind it (and the tick
 *  goes back if it fails). */
function CategoryPick({ a, k, types, none, header, footer }: { a: AdminData; k: Key; types: CatType[]; none: string; header: string; footer?: string }) {
  const { c } = useTheme()
  const s = a.settings
  const cats = a.categories.filter((x) => x.active)
  const [chosen, setChosen] = useState<number | null>(null)
  // Never stored: the server goes by the default name. Stored empty: switched off (None).
  const fallback = cats.find((x) => x.name === (k === 'roth_category' ? 'Roth IRA' : 'Other Income'))?.id ?? 0
  const cur = chosen ?? (s[k] === undefined ? fallback : Number(s[k] || 0))
  const choose = (id: number) => {
    Haptics.selectionAsync().catch(() => {})
    setChosen(id)
    write(() => api.putSettings({ [k]: id || '' }), 'Saved').then((ok) => { if (!ok) setChosen(null) })
  }
  const tick = (on: boolean) => (on ? <Icon sf="checkmark" md="check" size={16} color={c.ink} weight="bold" /> : undefined)
  return (
    <Group header={header} footer={footer}>
      {[
        ...cats.filter((x) => types.includes(x.type)).map((x) => (
          <Row key={x.id} label={x.name} chevron={false} onPress={() => choose(x.id)} trailing={tick(x.id === cur)} />
        )),
        <Row key="none" label="None" sub={none} chevron={false} onPress={() => choose(0)} trailing={tick(!cur)} />,
      ]}
    </Group>
  )
}

export function General({ a }: { a: AdminData }) {
  const { c } = useTheme()
  const s = a.settings
  const [ef, setEf] = useState(Number(s.ef_months ?? 6))
  const [roth, setRoth] = useState(s.roth_limit ? fromCents(Number(s.roth_limit)) : '')
  const step = (by: number) => {
    const n = Math.min(24, Math.max(1, ef + by))
    if (n === ef) return
    Haptics.selectionAsync().catch(() => {})
    setEf(n)
    write(() => api.putSettings({ ef_months: n }), 'Saved')
  }
  const circle = { width: 32, height: 32, borderRadius: 16, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' } as const
  return (
    <>
      <DoneBar />
      <Group header="Emergency fund" footer="The goal is this many months of your average spending. Accounts marked as emergency fund count toward it.">
        <Row label="Months of spending" chevron={false} value={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
            <Tap feedback="opacity" onPress={() => step(-1)} hitSlop={8} accessibilityLabel="Fewer months" style={circle}><Icon sf="minus" md="remove" size={14} color={c.label} weight="bold" /></Tap>
            <Txt variant="headline" num style={{ minWidth: 22, textAlign: 'center' }}>{ef}</Txt>
            <Tap feedback="opacity" onPress={() => step(1)} hitSlop={8} accessibilityLabel="More months" style={circle}><Icon sf="plus" md="add" size={14} color={c.label} weight="bold" /></Tap>
          </View>
        } />
      </Group>
      <Group header="Roth IRA yearly limit">
        <Row label="Limit" chevron={false} value={
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.fill, borderRadius: radius.input, paddingHorizontal: space.m, height: 36, width: 120 }}>
            <Txt variant="body" tone="label2">$</Txt>
            <TextInput value={roth} onChangeText={(t) => setRoth(t.replace(/[^0-9.]/g, ''))} onBlur={() => { if (toCents(roth) !== Number(s.roth_limit ?? 0)) write(() => api.putSettings({ roth_limit: roth || 0 }), 'Saved') }}
              {...decimalPad} accessibilityLabel="Roth IRA yearly limit" style={{ flex: 1, minWidth: 48, fontSize: 17, color: c.label, textAlign: 'right', fontVariant: ['tabular-nums'] }} />
          </View>
        } />
      </Group>
      <CategoryPick a={a} k="roth_category" types={['Saving', 'Transfer']} none="Nothing counts toward the Roth limit" header="Roth IRA contributions go to" />
    </>
  )
}

export function MonthEnd({ a }: { a: AdminData }) {
  return <CategoryPick a={a} k="interest_category" types={['Money in']} none="Month end skips the interest step" header="Interest is logged as"
    footer="Month end offers each savings account's interest as an entry in this category." />
}
