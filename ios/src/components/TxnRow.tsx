import { memo } from 'react'
import { View } from 'react-native'
import { Link } from 'expo-router'
import type { Account, Category, Txn } from '@/lib/api'
import { deleteTxns, openEntry } from '@/lib/actions'
import { isFuture } from '@/lib/dates'
import { rowAmount } from '@/lib/txn'
import type { MarkSpec } from '@/icons/merchants'
import { categoryVisual } from '@/icons/categories'
import { space, useTheme } from '@/theme'
import { Icon } from './Icon'
import { Mark } from './Mark'
import { Money } from './Money'
import { Tap } from './Tap'
import { Txt } from './Txt'

const web = process.env.EXPO_OS === 'web'

/** Which account a row is "about": where spending came from, where money landed, or From → To for transfers. */
function accountLine(t: Txn, c: Category, acct: Map<number, Account>): string {
  const f = t.from_id ? acct.get(t.from_id)?.name : undefined
  const to = t.to_id ? acct.get(t.to_id)?.name : undefined
  if (c.type === 'Money in') return to ?? ''
  if (c.type === 'Spending') return f ?? ''
  return f && to ? `${f} → ${to}` : (f ?? to ?? '')
}

export const TxnRow = memo(function TxnRow({ t, c, acct, mark, today, showDate }: {
  t: Txn; c: Category; acct: Map<number, Account>; mark: MarkSpec | null; today: string; showDate?: string
}) {
  const theme = useTheme()
  const v = categoryVisual(c)
  const amt = rowAmount(c.type, t.amount)
  const future = isFuture(t.date, today)
  const where = accountLine(t, c, acct)
  const row = (
        <Tap feedback="highlight" onPress={web ? () => openEntry(t.id) : undefined}
          accessibilityLabel={`${t.what}, ${c.name}, ${amt.sign === 'always' ? '+' : ''}${(amt.cents / 100).toFixed(2)} dollars${future ? ', scheduled' : ''}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m, opacity: future ? 0.55 : 1 }}>
          {mark ? <Mark kind="spec" spec={mark} /> : <Mark kind="glyph" sf={v.sf} md={v.md} tint={theme.tint(v.tint)} />}
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="row" numberOfLines={1}>{t.what || c.name}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Txt variant="sub" tone="label2" numberOfLines={1} style={{ flexShrink: 1 }}>
                {future ? `Scheduled, ${showDate ?? c.name}` : showDate ?? c.name}
              </Txt>
              {t.split_group && <Icon sf="square.split.2x1" md="call_split" size={11} color={theme.c.label2} />}
              {t.receipt && <Icon sf="paperclip" md="attach_file" size={11} color={theme.c.label2} />}
              {t.recurring_id && <Icon sf="repeat" md="repeat" size={11} color={theme.c.label2} />}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2, maxWidth: '42%' }}>
            <Money cents={amt.cents} sign={amt.sign} tone={amt.tone} muted={amt.muted} />
            {!!where && <Txt variant="sub" tone="label2" numberOfLines={1}>{where}</Txt>}
          </View>
        </Tap>
  )
  // The long-press menu is native iOS; on the web preview the row is a plain button.
  if (web) return row
  return (
    <Link href={{ pathname: '/entry', params: { id: String(t.id) } }} asChild>
      <Link.Trigger>{row}</Link.Trigger>
      <Link.Menu>
        <Link.MenuAction title="Edit" icon="pencil" onPress={() => openEntry(t.id)} />
        <Link.MenuAction title="Duplicate to today" icon="plus.square.on.square" onPress={() => openEntry(t.id, 'duplicate')} />
        <Link.MenuAction title="Delete" icon="trash" destructive onPress={() => deleteTxns([t])} />
      </Link.Menu>
    </Link>
  )
})
