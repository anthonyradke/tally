// A pending bank row: drawn like an entry (TxnRow) but dimmed, with "Pending" and its account under the name. It
// isn't an entry yet, so there's nothing to open, edit or delete: a tap folds out a line saying it's added once the
// bank posts it, and the bank's own description.
import { memo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import type { Account, PendingTxn } from '@/lib/api'
import { tick } from '../haptics'
import { useLedger } from '../ledger'
import { categoryLook, wantsLogo } from '../look'
import { fadeIn } from '../motion'
import { pendingAmount, pendingSub } from '../pending'
import { space, usePalette } from '../theme'
import { Logo } from './Logo'
import { Money } from './Money'
import { Txt } from './Txt'

/** How much a pending row is dimmed, as banking apps do until a charge posts. */
export const PENDING_OPACITY = 0.55

/** `account`: the list is that account's, so the amount reads like its statement and the account isn't repeated. */
export const PendingRow = memo(function PendingRow({ r, account }: { r: PendingTxn; account?: Account }) {
  const p = usePalette()
  const L = useLedger()
  const [open, setOpen] = useState(false)
  const c = r.category_id !== null ? L.cat.get(r.category_id) : undefined
  const look = categoryLook(c ?? { name: '', type: r.type })
  const amt = pendingAmount(r, account)
  const where = account ? undefined : L.acct.get(r.account_id)?.name
  const name = r.what || r.merchant || r.raw
  const raw = r.raw && r.raw.trim().toLowerCase() !== name.trim().toLowerCase() ? r.raw : null
  return (
    <Pressable onPress={() => { tick(); setOpen((o) => !o) }} accessibilityRole="button" accessibilityState={{ expanded: open }}
      accessibilityLabel={`${name}, pending`} accessibilityHint="Shows when it's added">
      {({ pressed }) => (
        <View style={{ backgroundColor: p.card }}>
          {pressed && <View style={[StyleSheet.absoluteFill, { backgroundColor: p.fill2 }]} />}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: 10, minHeight: 64, opacity: PENDING_OPACITY }}>
            <Logo name={wantsLogo(r.type) ? (r.merchant || name) : undefined} symbol={look.symbol} color={p[look.hue]} size={42} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="body" numberOfLines={1}>{name}</Txt>
              <Txt v="subhead" tone="label2" numberOfLines={1}>{pendingSub(where)}</Txt>
            </View>
            <Money cents={amt.cents} plus={amt.plus} tone={amt.tone} />
          </View>
          {open && (
            <Animated.View entering={fadeIn()} style={{ paddingLeft: 70, paddingRight: space.l, paddingBottom: space.m, marginTop: -space.xs, gap: 2 }}>
              <Txt v="footnote" tone="label2">Added to Tally once the bank posts it.</Txt>
              {raw ? <Txt v="footnote" tone="label3" numberOfLines={2}>{raw}</Txt> : null}
            </Animated.View>
          )}
        </View>
      )}
    </Pressable>
  )
})
