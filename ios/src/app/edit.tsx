// The editor modal for Settings items: account, category, quick action, recurring template, saved view, budget.
// Its own Cancel/Save; destructive actions sit at the bottom and act at once (the server refuses deletes that would
// orphan entries, and says to hide the item instead).
import { useEffect, useState, type ReactNode } from 'react'
import { KeyboardAvoidingView, ScrollView, Switch, TextInput, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Chip } from '@/components/Chip'
import { Icon } from '@/components/Icon'
import { Mark } from '@/components/Mark'
import { DatePick } from '@/components/native/DatePick'
import { Segmented } from '@/components/native/Segmented'
import { Group, Row } from '@/components/Row'
import { StateView } from '@/components/StateView'
import { Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { categoryVisual, GLYPH_NAMES, GLYPHS } from '@/icons/categories'
import { useAdmin, write } from '@/lib/admin'
import { close } from '@/lib/nav'
import { api, ApiError, type AdminData, type CatType, type Freq, type Kind } from '@/lib/api'
import { budgetAmount, initial, pctStr, type Form } from '@/lib/forms'
import { monthOf } from '@/lib/dates'
import { SHAPES } from '@/lib/shapes'
import { useTally } from '@/lib/tally'
import { radius, space, TINTS, useTheme, type Tint } from '@/theme'

const TITLE: Record<string, [string, string]> = {
  account: ['New account', 'Account'], category: ['New category', 'Category'], quick: ['New quick action', 'Quick action'],
  recurring: ['New recurring', 'Recurring'], view: ['Saved view', 'Saved view'], budget: ['Budget', 'Budget'],
}

export default function Edit() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id?: string }>()
  const { c } = useTheme()
  const admin = useAdmin()
  const t = useTally()
  const [f, setF] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (p: Form) => setF((s) => ({ ...s!, ...p }))
  const a = admin.data

  useEffect(() => {
    if (!a || !t.b || f) return
    setF(initial(kind, id ? Number(id) : undefined, a, t.b.today))
  }, [a, t.b]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!f) return
    setBusy(true)
    const n = id ? Number(id) : undefined
    const ok = await write(() => {
      switch (kind) {
        case 'account': {
          const orig = a!.accounts.find((x) => x.id === n)
          const body: Form = { ...f }
          // Rates are left out unless changed, so a rate imported at full precision isn't rounded by a re-save.
          if (orig && f.apy === pctStr(orig.apy)) delete body.apy
          if (orig && f.loan_rate === pctStr(orig.loan_rate)) delete body.loan_rate
          return api.saveAccount(body, n)
        }
        case 'category': return api.saveCategory(f, n)
        case 'quick': return api.saveFavorite(f, n)
        case 'recurring': return api.saveRecurring(f, n)
        case 'view': return api.saveView(f, n)
        case 'budget': {
          const amount = budgetAmount(String(f.amount ?? ''))
          if (amount === undefined) return Promise.reject(new ApiError(422, ['The budget must be a number.']))
          return api.setBudget(n!, amount, f.thisMonth ? monthOf(t.b!.today) : undefined)
        }
        default: return Promise.resolve()
      }
    }, 'Saved')
    setBusy(false)
    if (ok) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); close() }
  }
  const remove = async () => {
    const n = Number(id)
    const ok = await write(() => ({ account: api.deleteAccount, category: api.deleteCategory, quick: api.deleteFavorite, recurring: api.deleteRecurring, view: api.deleteView } as Record<string, (i: number) => Promise<void>>)[kind](n), 'Deleted')
    if (ok) close()
  }

  const [newTitle, editTitle] = TITLE[kind] ?? ['Edit', 'Edit']
  return (
    <>
      <Stack.Screen options={{ title: id ? editTitle : newTitle }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Cancel" onPress={() => close()} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="checkmark" variant="prominent" tintColor={c.ink} accessibilityLabel="Save" disabled={busy || !f} onPress={save} />
      </Stack.Toolbar>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
          contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 80 }}>
          {!f || !a ? <StateView q={admin} shape="list" /> : (
            <>
              {kind === 'account' && <AccountForm f={f} set={set} />}
              {kind === 'category' && <CategoryForm f={f} set={set} />}
              {kind === 'quick' && <QuickForm f={f} set={set} a={a} />}
              {kind === 'recurring' && <RecurringForm f={f} set={set} a={a} />}
              {kind === 'view' && <Group><Field label="Name" value={String(f.name ?? '')} onChange={(v) => set({ name: v })} /></Group>}
              {kind === 'budget' && <BudgetForm f={f} set={set} a={a} id={Number(id)} />}
              {id && kind !== 'budget' && (
                <Group footer={kind === 'account' || kind === 'category' ? 'Deleting only works when nothing uses it. Otherwise switch off Active to hide it and keep its history.' : kind === 'recurring' ? 'Deleting removes its future entries; ones already posted stay.' : undefined}>
                  <Row label={`Delete ${editTitle.toLowerCase()}`} destructive sf="trash" md="delete" onPress={remove} />
                </Group>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  )
}

function Field({ label, value, onChange, money, pct, placeholder, auto }: { label: string; value: string; onChange: (v: string) => void; money?: boolean; pct?: boolean; placeholder?: string; auto?: boolean }) {
  const { c } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, minHeight: 50 }}>
      <Txt variant="body" style={{ width: 118 }}>{label}</Txt>
      {money && <Txt variant="body" tone="label2">$</Txt>}
      <TextInput value={value} onChangeText={(v) => onChange(money || pct ? v.replace(/[^0-9.\-]/g, '') : v)} placeholder={placeholder ?? (money ? '0.00' : '')}
        placeholderTextColor={c.label3} keyboardType={money || pct ? 'decimal-pad' : 'default'} autoCapitalize={auto ? 'words' : 'sentences'} accessibilityLabel={label}
        style={{ flex: 1, fontSize: 17, color: c.label, paddingVertical: space.m, fontVariant: money || pct ? ['tabular-nums'] : undefined }} />
      {pct && <Txt variant="body" tone="label2">%</Txt>}
    </View>
  )
}

function Toggle({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return <Row label={label} sub={sub} chevron={false} trailing={<Switch value={value} onValueChange={onChange} />} />
}

/** A row that opens an inline list of options under it. */
function Choice<T extends string | number | null>({ label, value, options, onChange, leading }: {
  label: string; value: T; options: { value: T; label: string; leading?: ReactNode }[]; onChange: (v: T) => void; leading?: ReactNode
}) {
  const { c } = useTheme()
  const [open, setOpen] = useState(false)
  const cur = options.find((o) => o.value === value)
  return (
    <>
      <Row label={label} value={cur?.label ?? 'Choose'} leading={leading} onPress={() => setOpen((v) => !v)} />
      {open && options.map((o) => (
        <Row key={String(o.value)} label={o.label} leading={o.leading ?? <View style={{ width: 18 }} />} chevron={false}
          trailing={o.value === value ? <Icon sf="checkmark" md="check" size={16} color={c.ink} weight="bold" /> : undefined}
          onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(o.value); setOpen(false) }} />
      ))}
    </>
  )
}

function AccountForm({ f, set }: { f: Form; set: (p: Form) => void }) {
  const kind = f.kind as Kind
  return (
    <>
      <Group><Field label="Name" value={String(f.name)} onChange={(v) => set({ name: v })} auto /></Group>
      <Segmented options={[['cash', 'Cash'], ['card', 'Card'], ['investment', 'Invest'], ['loan', 'Loan']]} value={kind} onChange={(v) => set({ kind: v })} />
      <View style={{ gap: space.s }}>
        <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l }}>Bank color</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          {[[null, 'None'], ['chase', 'Chase'], ['amex', 'Amex'], ['sofi', 'SoFi'], ['hsa', 'Grey'], ['roth', 'Violet']].map(([v, l]) => (
            <Chip key={String(v)} label={l!} selected={f.bank === v} onPress={() => set({ bank: v })} />
          ))}
        </View>
      </View>
      <Group footer={kind === 'investment' ? 'Investments are updated at month end with their typed balance.' : kind === 'loan' ? 'Loans grow by rate / 12 each month and shrink with each payment.' : 'The balance on the day Tally starts counting.'}>
        <Field label={kind === 'card' || kind === 'loan' ? 'Starting owed' : 'Starting balance'} value={String(f.start_balance ?? '')} onChange={(v) => set({ start_balance: v })} money />
        {kind === 'cash' && <Field label="APY" value={String(f.apy ?? '')} onChange={(v) => set({ apy: v })} pct placeholder="None" />}
        {kind === 'loan' && <Field label="Interest rate" value={String(f.loan_rate ?? '')} onChange={(v) => set({ loan_rate: v })} pct placeholder="0" />}
      </Group>
      <Group>
        {kind === 'cash' && <Toggle label="Emergency fund" sub="Counts toward the emergency fund goal" value={!!f.ef} onChange={(v) => set({ ef: v })} />}
        <Toggle label="Active" sub="Hidden accounts keep their history but leave the pickers" value={!!f.active} onChange={(v) => set({ active: v })} />
      </Group>
    </>
  )
}

function CategoryForm({ f, set }: { f: Form; set: (p: Form) => void }) {
  const { c, tint } = useTheme()
  const v = categoryVisual({ name: String(f.name), type: f.type as CatType, icon: f.icon as string | null, color: f.color as string | null })
  return (
    <>
      <View style={{ alignItems: 'center', gap: space.m }}>
        <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={72} />
      </View>
      <Group><Field label="Name" value={String(f.name)} onChange={(x) => set({ name: x })} auto /></Group>
      <Segmented options={[['Spending', 'Spent'], ['Money in', 'Income'], ['Transfer', 'Transfer'], ['Saving', 'Saving'], ['Loan', 'Loan']]} value={f.type as CatType} onChange={(x) => set({ type: x })} />
      <View style={{ gap: space.s }}>
        <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l }}>Color</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.m, paddingHorizontal: space.xs }}>
          {TINTS.map((k) => (
            <Tap key={k} feedback="scale" onPress={() => set({ color: k })} accessibilityLabel={k} accessibilityState={{ selected: v.tint === k }}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: tint(k as Tint), borderWidth: v.tint === k ? 3 : 0, borderColor: c.panel, boxShadow: v.tint === k ? `0 0 0 2px ${c.ink}` : undefined }}>
              <View />
            </Tap>
          ))}
        </View>
      </View>
      <View style={{ gap: space.s }}>
        <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l }}>Symbol</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, backgroundColor: c.panel, borderRadius: radius.panel, padding: space.m }}>
          {GLYPH_NAMES.map((g) => (
            <Tap key={g} feedback="scale" onPress={() => set({ icon: g })} accessibilityLabel={g} accessibilityState={{ selected: v.glyph === g }}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: v.glyph === g ? tint(v.tint) : c.fill }}>
              <Icon sf={GLYPHS[g][0]} md={GLYPHS[g][1]} size={19} color={v.glyph === g ? '#FFFFFF' : c.label} />
            </Tap>
          ))}
        </View>
      </View>
      <Group>
        {f.type === 'Spending' && <Field label="Budget" value={String(f.budget ?? '')} onChange={(x) => set({ budget: x })} money placeholder="None" />}
        <Toggle label="Active" sub="Hidden categories keep their history but leave the pickers" value={!!f.active} onChange={(x) => set({ active: x })} />
      </Group>
    </>
  )
}

function AcctChoices({ f, set, a, type }: { f: Form; set: (p: Form) => void; a: AdminData; type: CatType }) {
  const s = SHAPES[type]
  const opts = a.accounts.filter((x) => x.active).map((x) => ({ value: x.id as number | null, label: x.name }))
  return (
    <>
      {s.from !== 'blank' && <Choice label="From" value={(f.from_account_id as number | null) ?? null} options={s.from === 'optional' ? [{ value: null, label: 'None' }, ...opts] : opts} onChange={(v) => set({ from_account_id: v })} />}
      {s.to !== 'blank' && <Choice label={s.to === 'optional' ? 'To (optional)' : 'To'} value={(f.to_account_id as number | null) ?? null} options={s.to === 'optional' ? [{ value: null, label: 'None' }, ...opts] : opts} onChange={(v) => set({ to_account_id: v })} />}
    </>
  )
}

function catOptions(a: AdminData, tint: (t: Tint) => string) {
  return a.categories.filter((x) => x.active).map((x) => {
    const v = categoryVisual(x)
    return { value: x.id as number | null, label: x.name, leading: <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={26} /> }
  })
}

function QuickForm({ f, set, a }: { f: Form; set: (p: Form) => void; a: AdminData }) {
  const { tint } = useTheme()
  const type = a.categories.find((x) => x.id === f.category_id)?.type ?? 'Spending'
  return (
    <>
      <Group><Field label="Label" value={String(f.label)} onChange={(v) => set({ label: v })} auto placeholder="Gas" /></Group>
      <Group footer="Leave the amount empty to type it each time.">
        <Choice label="Category" value={(f.category_id as number | null) ?? null} options={catOptions(a, tint)} onChange={(v) => set({ category_id: v })} />
        <AcctChoices f={f} set={set} a={a} type={type} />
        <Field label="Amount" value={String(f.amount ?? '')} onChange={(v) => set({ amount: v })} money placeholder="Optional" />
      </Group>
    </>
  )
}

function RecurringForm({ f, set, a }: { f: Form; set: (p: Form) => void; a: AdminData }) {
  const { tint } = useTheme()
  const type = a.categories.find((x) => x.id === f.category_id)?.type ?? 'Spending'
  return (
    <>
      <Group>
        <Field label="Label" value={String(f.label)} onChange={(v) => set({ label: v, what: f.what || v })} auto placeholder="Rent" />
        <Field label="Shows as" value={String(f.what ?? '')} onChange={(v) => set({ what: v })} auto placeholder="What entries are called" />
        <Field label="Amount" value={String(f.amount ?? '')} onChange={(v) => set({ amount: v })} money />
      </Group>
      <Group>
        <Choice label="Category" value={(f.category_id as number | null) ?? null} options={catOptions(a, tint)} onChange={(v) => set({ category_id: v })} />
        <AcctChoices f={f} set={set} a={a} type={type} />
      </Group>
      <Segmented options={[['weekly', 'Weekly'], ['biweekly', 'Every 2 wk'], ['monthly', 'Monthly'], ['yearly', 'Yearly']]} value={f.freq as Freq} onChange={(v) => set({ freq: v })} />
      <View style={{ gap: space.s }}>
        <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l }}>Next date</Txt>
        <DatePick value={String(f.next_date)} onChange={(v) => set({ next_date: v })} />
      </View>
      <Group footer="Paused templates stop posting. Resuming skips the dates you missed.">
        <Toggle label="Active" value={!!f.active} onChange={(v) => set({ active: v })} />
      </Group>
    </>
  )
}

function BudgetForm({ f, set, a, id }: { f: Form; set: (p: Form) => void; a: AdminData; id: number }) {
  const x = a.categories.find((r) => r.id === id)
  return (
    <>
      <Txt variant="title2" style={{ paddingHorizontal: space.xs }}>{x?.name}</Txt>
      <Group footer={f.thisMonth ? 'Only this month uses this amount; other months keep the regular budget.' : 'Every month uses this amount unless you set a one-off for a month.'}>
        <Field label="Per month" value={String(f.amount ?? '')} onChange={(v) => set({ amount: v })} money placeholder="None" />
        <Toggle label="Just this month" value={!!f.thisMonth} onChange={(v) => set({ thisMonth: v })} />
      </Group>
    </>
  )
}
