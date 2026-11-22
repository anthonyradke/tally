// The first page of a catch-up (app/catchup.tsx), where the account left off, and the list of what this session added
// to it. Once entries go in, the first page says how far the account is caught up, with Tally's balance to check
// against the bank's in one tap.
import { ScrollView, View } from 'react-native'
import type { Account, Txn } from '@/lib/api'
import { balanceWords } from '@/lib/balances'
import { midSentence } from '@/lib/catchup'
import { daysSince, suggestCatchUp, useCaughtUp } from '@/lib/caughtUp'
import { dayLabel, fromISO } from '@/lib/dates'
import { useTally } from '@/lib/tally'
import { radius, space, useTheme } from '@/theme'
import { AccountMark } from './AccountMark'
import { CheckDraw } from './CheckDraw'
import { Chip } from './Chip'
import { Hairline } from './Panel'
import { Row } from './Row'
import { Button, Tap } from './Tap'
import { TxnRow } from './TxnRow'
import { Txt } from './Txt'

const ago = (iso: string, today: string) => {
  const n = Math.round((fromISO(today).getTime() - fromISO(iso).getTime()) / 864e5)
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : `${dayLabel(iso, today)}, ${n} days ago`
}


/** An account's rows, newest first, each with the balance after it (as the bank's list shows it). Rows added this
 *  session (`session`) carry a dot, and a divider marks where the account left off before them. */
export function Ledger({ acct, rows, running, session, boundary }: {
  acct: Account; rows: Txn[]; running: Map<number, number> | null; session: Set<number>; boundary?: string
}) {
  const { c } = useTheme()
  const t = useTally()
  const today = t.today
  const cut = boundary ? rows.findIndex((r) => !session.has(r.id)) : -1
  return (
    <View style={{ marginHorizontal: space.l, backgroundColor: c.panel, borderRadius: radius.panel, borderCurve: 'continuous', overflow: 'hidden' }}>
      {rows.map((r, i) => {
        const bal = running?.get(r.id)
        const day = dayLabel(r.date, today)
        return (
          <View key={r.id}>
            {i === cut && cut > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.l, paddingVertical: space.xs }}>
                <View style={{ flex: 1, height: 1, backgroundColor: c.label3, opacity: 0.4 }} />
                <Txt variant="foot" tone="label2">{boundary}</Txt>
                <View style={{ flex: 1, height: 1, backgroundColor: c.label3, opacity: 0.4 }} />
              </View>
            ) : i > 0 && <Hairline inset={space.l + 40 + space.m} />}
            <View>
              <TxnRow t={r} c={t.catOf(r)} acct={t.acct} mark={t.markFor(r.what)} today={today} here={acct.id}
                showDate={bal != null && r.date <= today ? `${day}, balance ${balanceWords(bal, acct.kind)}` : day}
                padTop={i === 0 ? space.xs : 0} padBottom={i === rows.length - 1 ? space.xs : 0} />
              {session.has(r.id) && (
                <View pointerEvents="none" style={{ position: 'absolute', left: 6, top: '50%', marginTop: -3, width: 6, height: 6, borderRadius: 3, backgroundColor: c.ink }} />
              )}
            </View>
          </View>
        )
      })}
    </View>
  )
}

/** First page: pick the account, then see its newest entries, which is where the bank's list picks up. After adding
 *  some, it's how far the account is caught up and Tally's balance, with "Bank says the same" to reconcile at once. */
export function LeftOff({ accounts, acct, onAcct, rows, loading, added, session, running, balance, matched, onMatch, onCheck }: {
  accounts: Account[]; acct: Account; onAcct: (id: number) => void; rows: Txn[]; loading: boolean; added: number
  session: Set<number>; running: Map<number, number> | null; balance: number | null; matched: boolean
  onMatch: () => void; onCheck: () => void
}) {
  const { c } = useTheme()
  const t = useTally()
  const at = useCaughtUp((s) => s.at[String(acct.id)])
  const off = useCaughtUp((s) => !!s.off[String(acct.id)]) // "Not for this account" on Home's nudge
  if (!t.b) return null
  const today = t.today
  const since = at ? daysSince(at) : null
  const newest = rows[0]?.date
  const caught = added > 0 && !!newest
  return (
    <ScrollView contentContainerStyle={{ paddingVertical: space.s, gap: space.l }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l }}>
        {accounts.map((a) => <Chip key={a.id} label={a.name} selected={a.id === acct.id} leading={<AccountMark a={a} size={28} />} onPress={() => onAcct(a.id)} />)}
      </ScrollView>
      <View style={{ paddingHorizontal: space.l + space.xs, gap: 4 }}>
        <Txt variant="title2" accessibilityRole="header">{caught ? `Caught up through ${midSentence(newest, today)}` : 'Where you left off'}</Txt>
        <Txt variant="callout" tone="label2">
          {loading && !rows.length ? ' '
            : caught ? `${added === 1 ? '1 entry' : `${added} entries`} added to ${acct.name} just now.`
            : !newest ? `Nothing is on ${acct.name} yet.`
            : `The newest entry on ${acct.name} is from ${ago(newest, today)}. Pick up after it in the bank's app.`}
        </Txt>
        {since != null && !caught && (
          <Txt variant="callout" tone="label2">{`Last caught up ${since === 0 ? 'today' : since === 1 ? 'yesterday' : `${since} days ago`}.`}</Txt>
        )}
        {off && (
          <Tap feedback="opacity" onPress={() => suggestCatchUp(acct.id, true)} hitSlop={8} accessibilityLabel={`Home doesn't suggest catching up ${acct.name}. Suggest it again`}>
            <Txt variant="callout" tone="label2">
              {"Home doesn't suggest catching it up. "}<Txt variant="callout" style={{ fontWeight: '600' }}>Suggest again</Txt>
            </Txt>
          </Tap>
        )}
      </View>
      {caught && balance != null && (
        <View style={{ marginHorizontal: space.l, padding: space.l, gap: space.m, backgroundColor: c.panel, borderRadius: radius.panel, borderCurve: 'continuous' }}>
          <View style={{ gap: 2 }}>
            <Txt variant="sub" tone="label2">{`${acct.name} in Tally today`}</Txt>
            <Txt num style={{ fontSize: 34, fontWeight: '700', letterSpacing: -0.8, color: c.label }}>{balanceWords(balance, acct.kind)}</Txt>
          </View>
          {matched ? (
            <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 44 }}>
              <CheckDraw size={24} color={c.pos} />
              <Txt variant="headline">Matches the bank, reconciled</Txt>
            </View>
          ) : (
            <>
              <Txt variant="callout" tone="label2">{"Does the bank's app show the same?"}</Txt>
              <View style={{ flexDirection: 'row', gap: space.s }}>
                <Button label="Different…" secondary onPress={onCheck} style={{ flex: 1 }} />
                <Button label="Bank says the same" onPress={onMatch} style={{ flex: 2, paddingHorizontal: space.m }} />
              </View>
            </>
          )}
        </View>
      )}
      {rows.length > 0 && <Ledger acct={acct} rows={rows} running={running} session={session} boundary={caught ? 'Where you left off' : undefined} />}
      {!(caught && balance != null) && (
        <View style={{ marginHorizontal: space.l }}>
          <Row label="Check the balance against the bank" sf="checkmark.seal" md="verified" onPress={onCheck}
            sub={balance != null ? `Tally has ${balanceWords(balance, acct.kind)} today. Or match a statement file, line by line.` : 'Or match a statement file, line by line'} />
        </View>
      )}
    </ScrollView>
  )
}

/** What this session added to the account, newest first, each with the balance after it. Tapping one opens it to fix,
 *  and a swipe deletes it with Undo, as anywhere else. */
export function Session({ acct, rows, running }: { acct: Account; rows: Txn[]; running: Map<number, number> | null }) {
  const newest = [...rows].sort((x, z) => (x.date < z.date ? 1 : x.date > z.date ? -1 : z.id - x.id))
  return (
    <ScrollView contentContainerStyle={{ paddingVertical: space.s, gap: space.m }}>
      <View style={{ paddingHorizontal: space.l + space.xs, gap: 4 }}>
        <Txt variant="title2" accessibilityRole="header">Added just now</Txt>
        <Txt variant="callout" tone="label2">
          {rows.length ? `Tap one to fix it, or swipe it away. The balance after each is ${acct.name}'s, to check against the bank's list.` : `Nothing added to ${acct.name} yet.`}
        </Txt>
      </View>
      {rows.length > 0 && <Ledger acct={acct} rows={newest} running={running} session={new Set()} />}
    </ScrollView>
  )
}
