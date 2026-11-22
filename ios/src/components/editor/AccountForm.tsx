// The account editor's fields: what matters first (name, kind, balances, hide), the look last behind one Appearance
// row. Hiding an account that quick actions or recurring bills still post to says so and offers to move them.
import { useState, type ReactNode } from 'react'
import { View } from 'react-native'
import { AccountMark, bankKey, LogoMark } from '@/components/AccountMark'
import { Icon } from '@/components/Icon'
import { Segmented } from '@/components/native/Segmented'
import { Group, Row } from '@/components/Row'
import { Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { accountLogo, LOGO_IDS, LOGOS } from '@/icons/banks'
import { GLYPH_NAMES, GLYPHS, KIND_SYMBOL } from '@/icons/categories'
import type { AdminData, Kind } from '@/lib/api'
import { fromISO } from '@/lib/dates'
import { movable, moveTargets, standIn, usersText, type Form } from '@/lib/forms'
import { radius, space, TINTS, useTheme, type Tint } from '@/theme'
import { Choice, Field, Toggle } from './Fields'

const longDay = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** What the starting balance means for each kind, with the real first day: "the day Tally starts counting" never said
 *  which day, and a card added later with a balance lowered every month back to it. */
function balanceNote(kind: Kind, start: string): string {
  const d = longDay(start)
  if (kind === 'investment') return `Investments are updated at month end with their typed balance. For one opened after ${d}, when Tally starts counting, Opened is its first month, like 2026-10.`
  if (kind === 'loan') return `Loans grow by rate / 12 each month and shrink with each payment. For one taken out after ${d}, when Tally starts counting, Opened is its first month, like 2026-10, and Starting owed is what was owed at the start of it.`
  // Cards and cash have no Opened month (the engine only takes one for loans and investments), so the starting balance
  // counts from the first day. What a card opened since then owes today has to come in as its entries.
  if (kind === 'card') return `Owed on ${d}, when Tally starts counting, and counted in every month since, net worth included. Had the card then? Enter what it owed that day. Opened since? Leave this at 0 and add what it owes today as entries on this card, dated when the money was spent (one entry for the total is fine), so the months before it stay right.`
  return `The balance on ${d}, when Tally starts counting, and counted in every month since, net worth included. Opened since? Leave this at 0 and add the first deposit as an entry on the day it went in.`
}

export function AccountForm({ f, set, a, id, start }: { f: Form; set: (p: Form) => void; a: AdminData; id?: number; start: string }) {
  const kind = f.kind as Kind
  const orig = a.accounts.find((x) => x.id === id)
  const users = id ? movable(a, id) : { quick: [], recurring: [] }
  const hiding = !!orig?.active && !f.active && !!usersText(users)
  const targets = id ? moveTargets(a, id, users) : []
  const others = targets.map((x) => ({ value: x.id as number | null, label: x.name }))
  // Hiding a card when there's one other card picks it; "Leave them" is still one tap away.
  const hide = (on: boolean) => set({ active: !on, move_to: on && id && orig?.active && usersText(users) ? standIn(a.accounts, id, targets)?.id ?? null : null })
  return (
    <>
      <View style={{ alignItems: 'center' }}><AccountMark a={look(f)} size={72} /></View>
      <Group><Field label="Name" value={String(f.name)} onChange={(v) => set({ name: v })} auto /></Group>
      <Segmented options={[['cash', 'Cash'], ['card', 'Card'], ['investment', 'Invest'], ['loan', 'Loan']]} value={kind} onChange={(v) => set({ kind: v })} />
      <Group footer={balanceNote(kind, start)}>
        <Field label={kind === 'card' || kind === 'loan' ? 'Starting owed' : 'Starting balance'} value={String(f.start_balance ?? '')} onChange={(v) => set({ start_balance: v })} money />
        {kind === 'cash' && <Field label="APY" value={String(f.apy ?? '')} onChange={(v) => set({ apy: v })} pct placeholder="None" />}
        {kind === 'loan' && <Field label="Interest rate" value={String(f.loan_rate ?? '')} onChange={(v) => set({ loan_rate: v })} pct placeholder="0" />}
        {(kind === 'loan' || kind === 'investment') && <Field label="Opened" value={String(f.opened ?? '')} onChange={(v) => set({ opened: v })} placeholder="From the start" />}
      </Group>
      {(kind === 'cash' || !!id) && (
        <Group>
          {kind === 'cash' && <Toggle label="Emergency fund" sub="Counts toward the emergency fund goal" value={!!f.ef} onChange={(v) => set({ ef: v })} />}
          {/* Only for an account that exists: there's nothing to hide while it's being set up. */}
          {!!id && <Toggle label="Hide" sub="Leaves the pickers. While it holds a balance it stays on Accounts, marked Hidden, and still counts in totals. Its history stays." value={!f.active} onChange={hide} />}
        </Group>
      )}
      {hiding && (
        <Group header="Still posting here" footer={`${usersText(users)} ${users.quick.length + users.recurring.length === 1 ? 'uses' : 'use'} ${orig!.name}. Hidden, it still gets their entries unless you move them.`}>
          <Choice label="Move them to" value={(f.move_to as number | null) ?? null} options={[{ value: null, label: 'Leave them' }, ...others]} onChange={(v) => set({ move_to: v })} />
        </Group>
      )}
      <Appearance f={f} set={set} />
    </>
  )
}

const look = (f: Form) => ({ kind: f.kind as Kind, bank: f.bank as string | null, icon: f.icon as string | null, color: f.color as string | null, apy: Number(f.apy) || null })

/** Logo, color and symbol in one place, closed by default. A logo and a color are either/or, so picking one clears
 *  the other; a bank account with neither shows its bank's logo. The old separate bank-color chips were the same
 *  hues as the swatches. */
function Appearance({ f, set }: { f: Form; set: (p: Form) => void }) {
  const { c, tint, bank } = useTheme()
  const [open, setOpen] = useState(false)
  const kind = f.kind as Kind
  const logo = accountLogo(look(f))
  const glyph = typeof f.icon === 'string' && !f.icon.startsWith('logo:') ? f.icon : null
  const summary = logo ? logo.title : [f.color ? String(f.color)[0].toUpperCase() + String(f.color).slice(1) : 'Auto color', glyph ? 'own symbol' : ''].filter(Boolean).join(', ')
  const ring = (on: boolean) => ({ borderWidth: on ? 3 : 0, borderColor: c.panel, boxShadow: on ? `0 0 0 2px ${c.ink}` : undefined })
  return (
    <View style={{ gap: space.m }}>
      <Group>
        <Row label="Appearance" value={summary} leading={<AccountMark a={look(f)} size={30} />} chevron={false} onPress={() => setOpen((v) => !v)}
          trailing={<Icon sf={open ? 'chevron.up' : 'chevron.down'} md={open ? 'expand_less' : 'expand_more'} size={13} color={c.label3} weight="bold" />} />
      </Group>
      {open && (
        <View style={{ gap: space.l, backgroundColor: c.panel, borderRadius: radius.panel, borderCurve: 'continuous', padding: space.l }}>
          <View style={{ gap: space.s }}>
            <Txt variant="sub" tone="label2">Logo</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.m }}>
              <Tap feedback="scale" onPress={() => set({ icon: glyph, bank: null })} accessibilityLabel="No logo" accessibilityState={{ selected: !logo }}
                style={{ borderRadius: 22, borderWidth: 2, borderColor: !logo ? c.ink : 'transparent', padding: 2 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon sf="nosign" md="block" size={16} color={c.label2} />
                </View>
              </Tap>
              {LOGO_IDS.map((lid) => {
                const on = logo === LOGOS[lid]
                return (
                  <Tap key={lid} feedback="scale" onPress={() => set({ icon: `logo:${lid}`, color: null })} accessibilityLabel={LOGOS[lid].title} accessibilityState={{ selected: on }}
                    style={{ borderRadius: 22, borderWidth: 2, borderColor: on ? c.ink : 'transparent', padding: 2 }}>
                    <LogoMark logo={LOGOS[lid]} size={36} />
                  </Tap>
                )
              })}
            </View>
          </View>
          <View style={{ gap: space.s }}>
            <Txt variant="sub" tone="label2">{logo ? 'Or a color, in place of the logo' : 'Color'}</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.m }}>
              <Auto on={!logo && f.color == null} height={36} label="Automatic color" onPress={() => set({ color: null, icon: glyph, bank: logo ? null : f.bank })}>
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: bank(bankKey({ bank: logo ? null : f.bank as string | null, kind })) }} />
              </Auto>
              {TINTS.map((k) => {
                const on = !logo && f.color === k
                return (
                  <Tap key={k} feedback="scale" accessibilityLabel={k} accessibilityState={{ selected: on }} onPress={() => set({ color: k, icon: glyph })}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: tint(k as Tint), ...ring(on) }}>
                    <View />
                  </Tap>
                )
              })}
            </View>
          </View>
          <View style={{ gap: space.s }}>
            <Txt variant="sub" tone="label2">Symbol</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              <Auto on={!logo && glyph == null} height={44} label={`Automatic symbol, the ${kind} one`} onPress={() => set({ icon: null, ...(logo ? { bank: null } : {}) })}>
                <Icon sf={KIND_SYMBOL[kind][0]} md={KIND_SYMBOL[kind][1]} size={15} color={c.label2} />
              </Auto>
              {GLYPH_NAMES.map((g) => {
                const on = !logo && glyph === g
                const [sf, md] = GLYPHS[g]
                return (
                  <Tap key={g} feedback="scale" onPress={() => set({ icon: g })} accessibilityLabel={g} accessibilityState={{ selected: on }}
                    style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.ink : c.fill }}>
                    <Icon sf={sf} md={md} size={19} color={on ? c.onInk : c.label} />
                  </Tap>
                )
              })}
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

/** The usual color or symbol as an outlined "Auto" pill with a small preview: drawn as a swatch, an account with no
 *  bank got the same grey as the last tint and the same glyph as one in the grid, two identical circles each. */
function Auto({ on, height, label, onPress, children }: { on: boolean; height: number; label: string; onPress: () => void; children: ReactNode }) {
  const { c } = useTheme()
  return (
    <Tap feedback="scale" onPress={onPress} accessibilityLabel={label} accessibilityState={{ selected: on }}
      style={{ height, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.m, borderRadius: height / 2, borderWidth: 2, borderColor: on ? c.ink : c.sep }}>
      {children}
      <Txt variant="callout" style={{ fontWeight: '600' }}>Auto</Txt>
    </Tap>
  )
}
