// Under a Reconcile gap: the account's entries since it last matched the bank, to tick off one by one against the
// bank's list. The ticks are only for this look; nothing is saved.
import { useState } from 'react'
import { View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import { api, type Account } from '@/lib/api'
import { effect, useAllTxns } from '@/lib/balances'
import { midSentence, touches } from '@/lib/catchup'
import { addDays, dayLabel } from '@/lib/dates'
import { useTally } from '@/lib/tally'
import { radius, space, useTheme } from '@/theme'
import { Icon } from './Icon'
import { Money } from './Money'
import { Hairline } from './Panel'
import { Tap } from './Tap'
import { Txt } from './Txt'

/** Without a match to go back to, this many days. */
const FALLBACK_DAYS = 30
const MAX_ROWS = 60

export function ReconcileSince({ a }: { a: Account }) {
  const { c } = useTheme()
  const t = useTally()
  const all = useAllTxns(!!t.b)
  const recs = useQuery({ queryKey: ['reconciliations'], queryFn: api.reconciliations })
  const [ticked, setTicked] = useState<ReadonlySet<number>>(new Set())
  if (!t.b || !all.data) return null
  const today = t.today
  const matched = (recs.data ?? []).find((r) => r.account_id === a.id && r.actual === r.expected) // newest first
  const since = matched?.date ?? addDays(today, -FALLBACK_DAYS)
  // From the day it matched on: entries can go in on that day after the check.
  const rows = all.data.items.filter((x) => touches(x, a.id) && (matched ? x.date >= since : x.date > since) && x.date <= today).reverse().slice(0, MAX_ROWS)
  if (!rows.length) return null
  const toggle = (id: number) => {
    Haptics.selectionAsync().catch(() => {})
    setTicked((s) => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n })
  }
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l }}>
        {matched ? `Since it last matched the bank, ${midSentence(matched.date, today)}` : `The last ${FALLBACK_DAYS} days`}
      </Txt>
      <View style={{ backgroundColor: c.panel, borderRadius: radius.panel, borderCurve: 'continuous', overflow: 'hidden' }}>
        {rows.map((x, i) => {
          const v = effect(a, x)
          const incoming = a.kind === 'card' ? v < 0 : v > 0 // money in, or a payment onto the card
          const on = ticked.has(x.id)
          return (
            <View key={x.id}>
              {i > 0 && <Hairline inset={space.l + 22 + space.m} />}
              <Tap feedback="highlight" onPress={() => toggle(x.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 52, paddingHorizontal: space.l, paddingVertical: space.s }}>
                <Icon sf={on ? 'checkmark.circle.fill' : 'circle'} md={on ? 'check_circle' : 'radio_button_unchecked'} size={22} color={on ? c.pos : c.label3} weight="regular" />
                <View style={{ flex: 1, gap: 1 }}>
                  <Txt variant="body" numberOfLines={1}>{x.what || t.catOf(x).name}</Txt>
                  <Txt variant="foot" tone="label2" numberOfLines={1}>{`${dayLabel(x.date, today)}, ${t.catOf(x).name}`}</Txt>
                </View>
                <Money cents={Math.abs(v)} sign={incoming ? 'always' : 'auto'} tone={incoming ? 'pos' : 'neutral'} variant="callout" />
              </Tap>
            </View>
          )
        })}
      </View>
      <Txt variant="foot" tone="label2" style={{ paddingHorizontal: space.l }}>
        {`Tick each one the bank's list has too: what's left unticked is where the gap is. ${ticked.size} of ${rows.length} ticked.`}
      </Txt>
    </View>
  )
}
