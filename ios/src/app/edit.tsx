// The editor modal for Settings items: account, category, quick action, recurring template, saved view, budget.
// Its own Cancel/Save; destructive actions sit at the bottom and act at once (the server refuses deletes that would
// orphan entries, and says to hide the item instead). Closing with unsaved changes says so, with the draft one tap
// away (no confirm dialogs).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, KeyboardAvoidingView, ScrollView, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { AccountForm } from '@/components/editor/AccountForm'
import { DoneBar, Field, Toggle } from '@/components/editor/Fields'
import { Pickers } from '@/components/editor/Pickers'
import { RecurringActions, RecurringForm } from '@/components/editor/RecurringForm'
import { Icon } from '@/components/Icon'
import { Mark } from '@/components/Mark'
import { Segmented } from '@/components/native/Segmented'
import { Group, Row } from '@/components/Row'
import { StateView } from '@/components/StateView'
import { Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { categoryVisual, GLYPH_NAMES, GLYPHS } from '@/icons/categories'
import { useAdmin, write } from '@/lib/admin'
import { close, useBusy, useCloseHere, useLatest } from '@/lib/nav'
import { api, ApiError, type AdminData, type CatType, type Freq } from '@/lib/api'
import { accountUsers, budgetAmount, changed, favoriteBody, initial, movedText, pctStr, recurringBody, swapAccount, usersText, type Form } from '@/lib/forms'
import { monthOf } from '@/lib/dates'
import { dueOf, removeRecurring } from '@/lib/recurringActions'
import { useTally } from '@/lib/tally'
import { toast, type ToastMsg } from '@/lib/toast'
import { radius, space, TINTS, useTheme, type Tint } from '@/theme'

const TITLE: Record<string, [string, string]> = {
  account: ['New account', 'Account'], category: ['New category', 'Category'], quick: ['New quick action', 'Quick action'],
  recurring: ['New recurring', 'Recurring'], view: ['Saved view', 'Saved view'], budget: ['Budget', 'Budget'],
}

type Note = Omit<ToastMsg, 'id'>

export default function Edit() {
  // prefill: starting fields for a new item, as JSON (a suggested recurring template from Settings → Recurring).
  // draft: fields typed before the editor was closed without saving, brought back by the toast's Keep editing.
  const { kind, id, prefill, draft } = useLocalSearchParams<{ kind: string; id?: string; prefill?: string; draft?: string }>()
  const { c } = useTheme()
  const admin = useAdmin()
  const t = useTally()
  const [f, setF] = useState<Form | null>(null)
  const [start, setStart] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const once = useBusy() // a ref, not the state above: two quick taps both saw busy as false
  const closeHere = useCloseHere()
  const finished = useRef(false) // saved or deleted: closing has nothing to warn about
  const set = (p: Form) => setF((s) => ({ ...s!, ...p }))
  const a = admin.data
  const n = id ? Number(id) : undefined

  // The form starts once Settings data is in (set while rendering, so it's filled on the frame the data lands).
  if (a && t.b && !f) {
    const parse = (s?: string): Form => { try { return s ? JSON.parse(s) : {} } catch { return {} } } // a bad one is ignored
    const s = { ...initial(kind, n, a, t.b.today), ...(n ? {} : parse(prefill)) }
    setStart(s)
    setF({ ...s, ...parse(draft) })
  }

  // ✕ and a swipe down both unmount the screen; changes that weren't saved come back with Keep editing.
  const latest = useLatest({ f, start })
  useEffect(() => () => {
    const { f: now, start: was } = latest.current
    if (finished.current || !now || !was || !changed(was, now)) return
    toast({ text: 'Changes not saved', action: { label: 'Keep editing', run: () => { router.push({ pathname: '/edit', params: { kind, ...(id ? { id } : {}), draft: JSON.stringify(now) } }) } } })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => once(saveNow)
  async function saveNow() {
    if (!f || !a) return
    setBusy(true)
    let note: Note = { text: 'Saved' }
    const ok = await write(async () => {
      switch (kind) {
        case 'account': note = await saveAccount(f, a, n, t.today) ?? note; return
        case 'category': return api.saveCategory(f, n)
        case 'quick': return api.saveFavorite(f, n)
        case 'recurring': {
          const r = a.recurring.find((x) => x.id === n)
          // Unchanged by hand, it goes back as the date due now: a skip from this screen moves that on meanwhile, and
          // the date it opened with would then read as a move.
          if (!r || f.next_date === start?.next_date) return api.saveRecurring(r ? { ...f, next_date: dueOf(r) } : f, n)
          // A new date: its entries ahead are posted again from it. Undo puts the old schedule back.
          await api.saveRecurring({ ...f, move: true }, n)
          note = { text: movedText(String(f.label), f.freq as Freq, String(f.next_date), t.today), action: { label: 'Undo', run: async () => {
            await write(() => api.saveRecurring({ ...recurringBody(r), next_date: dueOf(r), move: true }, n))
          } } }
          return
        }
        case 'view': return api.saveView(f, n)
        case 'budget': {
          const amount = budgetAmount(String(f.amount ?? ''))
          if (amount === undefined) throw new ApiError(422, ['The budget must be a number.'])
          return api.setBudget(n!, amount, f.thisMonth ? monthOf(t.b!.today) : undefined)
        }
      }
    })
    setBusy(false)
    if (!ok) return
    finished.current = true
    toast(note)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    closeHere()
  }
  // Once: a second tap on a recurring delete got a 204, whose toast (no Undo) replaced the first one's Undo, and its
  // close() popped Settings too.
  const remove = () => once(removeNow)
  async function removeNow() {
    if (!a || !n) return
    // Quick actions, views and recurring templates come back with Undo (no confirm dialogs anywhere). Accounts and
    // categories can only be deleted when nothing uses them, so there's nothing to lose.
    const r = a.recurring.find((x) => x.id === n)
    if (kind === 'recurring') {
      if (r && await removeRecurring(r)) { finished.current = true; closeHere() }
      return
    }
    let back: (() => Promise<unknown>) | undefined
    const ok = await write(async () => {
      if (kind === 'quick') {
        const x = a.favorites.find((q) => q.id === n)
        await api.deleteFavorite(n)
        // Back in its old place: it comes back with a new id, which sorted it last.
        const ids = a.favorites.map((q) => q.id)
        if (x) back = async () => { const made = await api.saveFavorite(favoriteBody(x)); await api.orderFavorites(ids.map((i) => (i === n ? made.id : i))) }
      } else if (kind === 'view') {
        const x = a.saved_views.find((v) => v.id === n)
        await api.deleteView(n)
        const ids = a.saved_views.map((v) => v.id)
        if (x) back = async () => { const made = await api.saveView(x); await api.orderViews(ids.map((i) => (i === n ? made.id : i))) }
      } else await (kind === 'account' ? api.deleteAccount : api.deleteCategory)(n)
    })
    if (!ok) return
    finished.current = true
    toast({ text: 'Deleted', action: back ? { label: 'Undo', run: async () => { await write(back!) } } : undefined })
    closeHere()
  }

  const [newTitle, editTitle] = TITLE[kind] ?? ['Edit', 'Edit']
  // Kept from one render to the next (this screen renders on every key): a new one rebuilds the header's buttons, and a
  // tap in between was lost.
  const title = id ? editTitle : newTitle
  const off = busy || !f
  const live = useLatest(save)
  const header = useMemo(() => (
    <>
      <Stack.Screen options={{ title }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Cancel" onPress={() => { Keyboard.dismiss(); close() }} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="checkmark" variant="prominent" tintColor={c.ink} accessibilityLabel="Save" disabled={off} onPress={() => live.current()} />
      </Stack.Toolbar>
    </>
  ), [title, off, c.ink]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {header}
      <DoneBar />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
          contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 80 }}>
          {!f || !a ? <StateView q={admin} shape="list" /> : (
            <>
              {kind === 'account' && <AccountForm f={f} set={set} a={a} id={n} start={t.b?.start ?? t.today} />}
              {kind === 'category' && <CategoryForm f={f} set={set} />}
              {kind === 'quick' && <QuickForm f={f} set={set} a={a} />}
              {kind === 'recurring' && <RecurringForm f={f} set={set} a={a} id={n} />}
              {kind === 'recurring' && !!n && <RecurringActions id={n} a={a} onActive={(on) => { set({ active: on }); setStart((s) => s && { ...s, active: on }) }} />}
              {kind === 'view' && <Group><Field label="Name" value={String(f.name ?? '')} onChange={(v) => set({ name: v })} /></Group>}
              {kind === 'budget' && <BudgetForm f={f} set={set} a={a} id={n!} />}
              {id && kind !== 'budget' && (
                <Group footer={kind === 'account' || kind === 'category' ? 'Deleting only works when nothing uses it. Otherwise hide it to keep its history.' : kind === 'recurring' ? 'Deleting removes its future entries; ones already posted stay.' : undefined}>
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

/** Saves an account; hiding one with "Move them to" picked also moves its quick actions and recurring bills there,
 *  and the toast says so with Undo. */
async function saveAccount(f: Form, a: AdminData, n: number | undefined, today: string): Promise<Note | undefined> {
  const orig = a.accounts.find((x) => x.id === n)
  const { move_to: to, ...body } = f
  // Rates are left out unless changed, so a rate imported at full precision isn't rounded by a re-save.
  if (orig && f.apy === pctStr(orig.apy)) delete body.apy
  if (orig && f.loan_rate === pctStr(orig.loan_rate)) delete body.loan_rate
  if (f.kind !== 'loan' && f.kind !== 'investment') body.opened = ''
  await api.saveAccount(body, n)
  if (!orig || !n || to == null || !orig.active || f.active) return undefined
  const u = accountUsers(a, n)
  const dest = Number(to)
  for (const q of u.quick) await api.saveFavorite(favoriteBody(swapAccount(q, n, dest)), q.id)
  for (const r of u.recurring) await api.saveRecurring(recurringBody(swapAccount(r, n, dest)), r.id)
  const was = initial('account', n, a, today)
  delete was.apy
  delete was.loan_rate
  return {
    text: `Hidden ${orig.name}. Moved ${usersText(u)} to ${a.accounts.find((x) => x.id === dest)?.name ?? 'the other account'}.`,
    action: { label: 'Undo', run: async () => { await write(async () => {
      for (const q of u.quick) await api.saveFavorite(favoriteBody(q), q.id)
      for (const r of u.recurring) await api.saveRecurring(recurringBody(r), r.id)
      await api.saveAccount(was, n)
    }) } },
  }
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
      <Group>
        {f.type === 'Spending' && <Field label="Budget" value={String(f.budget ?? '')} onChange={(x) => set({ budget: x })} money placeholder="None" />}
        <Toggle label="Hide" sub="Leaves the pickers. Its history stays, and still counts in totals." value={!f.active} onChange={(x) => set({ active: !x })} />
      </Group>
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
    </>
  )
}

function QuickForm({ f, set, a }: { f: Form; set: (p: Form) => void; a: AdminData }) {
  return (
    <>
      <Group footer="The chip's name on Home, and what its entries are called.">
        <Field label="Name" value={String(f.label)} onChange={(v) => set({ label: v })} auto placeholder="Gas" />
      </Group>
      <Group footer="Leave the amount empty to type it each time.">
        <Pickers f={f} set={set} a={a} />
        <Field label="Amount" value={String(f.amount ?? '')} onChange={(v) => set({ amount: v })} money placeholder="Optional" />
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
