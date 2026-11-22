// Every Settings list in one route: accounts, categories, quick actions, recurring, saved views, budgets, goals,
// the Home layout, Activity's filter rows, the theme, the app icon and the server. Item editors open as the `edit` modal.
import { useMemo, useState } from 'react'
import { Switch, TextInput, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import Constants from 'expo-constants'
import * as Haptics from 'expo-haptics'
import { AccountMark } from '@/components/AccountMark'
import { DragGroup, DragScrollView } from '@/components/DragGroup'
import { Icon } from '@/components/Icon'
import { Mark } from '@/components/Mark'
import { Group, Row } from '@/components/Row'
import { StateView } from '@/components/StateView'
import { AppIconPicker } from '@/components/AppIconPicker'
import { FilterBarSettings } from '@/components/FilterBarSettings'
import { Budgets } from '@/components/settings/Budgets'
import { Deleted } from '@/components/settings/Deleted'
import { General, MonthEnd } from '@/components/settings/Goals'
import { RecurringList } from '@/components/settings/RecurringList'
import { closeSwipes } from '@/components/SwipeRow'
import { ThemePicker } from '@/components/ThemePicker'
import { Button, Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { categoryVisual, KIND_LABEL } from '@/icons/categories'
import { useAdmin, write } from '@/lib/admin'
import { api, ApiError, probe, type AdminData, type CatType, type Kind } from '@/lib/api'
import { invalidateAll, queryClient } from '@/lib/data'
import { dayLabel, fromISO, monthBefore, toISO } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { discard, flush, useOutbox } from '@/lib/outbox'
import { cleanServer, defaultServer, useServer } from '@/lib/server'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { radius, space, useTheme } from '@/theme'

const TITLES: Record<string, string> = {
  accounts: 'Accounts', categories: 'Categories', quick: 'Quick actions', recurring: 'Recurring', views: 'Saved views',
  budgets: 'Budgets', general: 'Goals', monthend: 'Month end', home: 'Home screen', activity: 'Activity filters', server: 'Server', theme: 'Theme', icon: 'App icon',
  capture: 'Add from Wallet', deleted: 'Recently deleted',
}

export default function SettingsSection() {
  const { section } = useLocalSearchParams<{ section: string }>()
  const { c } = useTheme()
  const admin = useAdmin()
  const [reorder, setReorder] = useState(false)
  const canAdd = ['accounts', 'categories', 'quick', 'recurring'].includes(section)
  const canOrder = ['accounts', 'categories', 'quick', 'activity', 'home'].includes(section)
  const editKind = { accounts: 'account', categories: 'category', quick: 'quick', recurring: 'recurring' }[section]
  // Kept between renders: Settings data refreshing re-rendered this, and a new toolbar lost taps on + (lib/nav).
  const header = useMemo(() => (
    <>
      <Stack.Screen options={{ title: TITLES[section] ?? 'Settings', headerLargeTitle: false }} />
      {(canAdd || canOrder) && (
        <Stack.Toolbar placement="right">
          {canOrder && <Stack.Toolbar.Button icon={reorder ? 'checkmark' : 'arrow.up.arrow.down'} accessibilityLabel={reorder ? 'Done reordering' : 'Reorder'} onPress={() => setReorder((v) => !v)} />}
          {canAdd && !reorder && <Stack.Toolbar.Button icon="plus" accessibilityLabel="Add" onPress={() => router.push({ pathname: '/edit', params: { kind: editKind! } })} />}
        </Stack.Toolbar>
      )}
    </>
  ), [section, reorder, canAdd, canOrder, editKind])
  return (
    <>
      {header}
      <DragScrollView contentInsetAdjustmentBehavior="automatic" keyboardDismissMode="interactive" onScrollBeginDrag={closeSwipes} style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 100 }}>
        {section === 'activity' ? <FilterBarSettings reorder={reorder} /> : section === 'capture' ? <Capture /> : section === 'deleted' ? <Deleted /> : section === 'server' ? <Server /> : section === 'theme' ? <Themes /> : section === 'icon' ? <AppIconPicker /> : !admin.data ? <StateView q={admin} shape="list" /> : (
          <>
            {section === 'accounts' && <Accounts a={admin.data} reorder={reorder} />}
            {section === 'categories' && <Categories a={admin.data} reorder={reorder} />}
            {section === 'quick' && <Quick a={admin.data} reorder={reorder} />}
            {section === 'recurring' && <RecurringList a={admin.data} empty={<Empty sf="repeat" md="repeat" title="Nothing recurring yet" body="Add a paycheck, rent or a subscription and Tally posts it ahead of time, about 45 days out." />} />}
            {section === 'views' && <Views a={admin.data} />}
            {section === 'budgets' && <Budgets a={admin.data} />}
            {section === 'general' && <General a={admin.data} />}
            {section === 'monthend' && <MonthEnd a={admin.data} />}
            {section === 'home' && <HomeLayout a={admin.data} reorder={reorder} />}
          </>
        )}
      </DragScrollView>
    </>
  )
}

/** The whole list's ids with one group's rows put in their new order, in the slots that group held. */
function withGroup<T extends { id: number }>(all: T[], group: T[]): number[] {
  const inGroup = new Set(group.map((x) => x.id))
  let i = 0
  return all.map((x) => (inGroup.has(x.id) ? group[i++] : x).id)
}

function Hidden() {
  const { c } = useTheme()
  return <View style={{ paddingHorizontal: 8, height: 20, borderRadius: radius.pill, backgroundColor: c.fill, justifyContent: 'center' }}><Txt variant="foot" tone="label2">Hidden</Txt></View>
}

function Accounts({ a, reorder }: { a: AdminData; reorder: boolean }) {
  return (
    <>
      {(['cash', 'card', 'investment', 'loan'] as Kind[]).map((k) => {
        const list = a.accounts.filter((x) => x.kind === k)
        if (!list.length) return null
        return (
          <DragGroup key={k} header={KIND_LABEL[k]} items={list} keyOf={(x) => x.id} handles={reorder}
            onReorder={(next) => write(() => api.orderAccounts(withGroup(a.accounts, next)))}
            render={(x, handle) => (
              <Row label={x.name} chevron={!reorder}
                leading={<AccountMark a={x} size={30} />}
                trailing={handle ?? (!x.active ? <Hidden /> : undefined)}
                onPress={reorder ? undefined : () => router.push({ pathname: '/edit', params: { kind: 'account', id: String(x.id) } })} />
            )} />
        )
      })}
    </>
  )
}

function Categories({ a, reorder }: { a: AdminData; reorder: boolean }) {
  const { tint } = useTheme()
  return (
    <>
      {(['Spending', 'Money in', 'Transfer', 'Saving', 'Loan'] as CatType[]).map((ty) => {
        const list = a.categories.filter((x) => x.type === ty)
        if (!list.length) return null
        return (
          <DragGroup key={ty} header={ty} items={list} keyOf={(x) => x.id} handles={reorder}
            onReorder={(next) => write(() => api.orderCategories(withGroup(a.categories, next)))}
            render={(x, handle) => {
              const v = categoryVisual(x)
              return (
                <Row label={x.name} chevron={!reorder} value={!reorder && x.budget ? `${formatCents(x.budget, { cents: false })}/mo` : undefined}
                  leading={<Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={30} />}
                  trailing={handle ?? (!x.active ? <Hidden /> : undefined)}
                  onPress={reorder ? undefined : () => router.push({ pathname: '/edit', params: { kind: 'category', id: String(x.id) } })} />
              )
            }} />
        )
      })}
    </>
  )
}

function Quick({ a, reorder }: { a: AdminData; reorder: boolean }) {
  const { tint } = useTheme()
  const cats = new Map(a.categories.map((x) => [x.id, x]))
  const accts = new Map(a.accounts.map((x) => [x.id, x]))
  if (!a.favorites.length) return <Empty sf="bolt" md="bolt" title="No quick actions" body="A quick action is a one-tap start for an entry you log often, like Gas on the Amex." />
  return (
    <DragGroup footer="Quick actions show on Home and at the top of a new entry." items={a.favorites} keyOf={(f) => f.id} handles={reorder}
      onReorder={(next) => write(() => api.orderFavorites(next.map((f) => f.id)))}
      render={(f, handle) => {
        const cat = cats.get(f.category_id)
        const v = cat ? categoryVisual({ ...cat, icon: f.icon ?? cat.icon, color: f.color ?? cat.color }) : null
        const where = [f.from_account_id, f.to_account_id].filter(Boolean).map((id) => accts.get(id!)?.name).join(' → ')
        return (
          <Row label={f.label} sub={[cat?.name, where, f.amount ? formatCents(f.amount) : ''].filter(Boolean).join(', ')} chevron={!reorder}
            leading={v ? <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={30} /> : undefined}
            trailing={handle ?? undefined}
            onPress={reorder ? undefined : () => router.push({ pathname: '/edit', params: { kind: 'quick', id: String(f.id) } })} />
        )
      }} />
  )
}

function Views({ a }: { a: AdminData }) {
  if (!a.saved_views.length) return <Empty sf="bookmark" md="bookmark" title="No saved views" body="Set filters in Activity, then save them from the Filters sheet to come back to them in one tap." />
  return (
    <Group footer="Rename or delete a view here. Create them from Activity's Filters.">
      {a.saved_views.map((v) => <Row key={v.id} label={v.name} sf="bookmark" md="bookmark" onPress={() => router.push({ pathname: '/edit', params: { kind: 'view', id: String(v.id) } })} />)}
    </Group>
  )
}

function Empty({ sf, md, title, body }: { sf: 'bolt' | 'repeat' | 'bookmark'; md: string; title: string; body: string }) {
  const { c } = useTheme()
  return (
    <View style={{ alignItems: 'center', gap: space.s, paddingTop: space.section, paddingHorizontal: space.xl }}>
      <Icon sf={sf} md={md} size={30} color={c.label3} />
      <Txt variant="headline">{title}</Txt>
      <Txt variant="callout" tone="label2" style={{ textAlign: 'center' }}>{body}</Txt>
    </View>
  )
}

/** Each Home card by the title Home gives it, and what it shows. The month cards carry the month's name there. */
function widgetNames(today: string): Record<string, [string, string?]> {
  const month = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'long' })
  return {
    networth: [`Up in ${month(today)}`, 'Money in, less spending and loan payments. A tap on Home swaps it for net worth.'],
    review: [`${month(monthBefore(today))} in review`, 'Shows during the first week of a month'],
    stats: [month(today), 'Spent so far, against the months before'], quick: ['Quick add'], budgets: ['Budgets'], spending: ['Where it went'],
    ef: ['Emergency fund'], forecast: ['Next 30 days'], upcoming: ['Coming up'], recent: ['Recent'], roth: ['Roth IRA'],
    chart: ['Net worth over time', 'Appears once there are three months'],
  }
}
const ORDER = ['networth', 'review', 'stats', 'quick', 'budgets', 'spending', 'ef', 'forecast', 'upcoming', 'recent', 'roth', 'chart']

/** With Next 30 days and Coming up both on, Home shows them as one Coming up section where the first of the two sits
 *  (index.tsx); listed as two cards, nothing here said so. */
function aheadNote(id: string, order: string[], hidden: Set<string>, names: Record<string, [string, string?]>): string | undefined {
  const pair = ['forecast', 'upcoming']
  if (!pair.includes(id) || pair.some((x) => hidden.has(x))) return names[id]?.[1]
  const first = order.find((x) => pair.includes(x))
  const other = names[pair.find((x) => x !== id)!][0]
  return id === first ? `With ${other} on, the two show here as one Coming up section` : `Shows in one section with ${other}, where that one sits`
}

function HomeLayout({ a, reorder }: { a: AdminData; reorder: boolean }) {
  const { today } = useTally()
  const names = widgetNames(today)
  // Switches and moves show at once; the save follows (a switch used to flip back until the server answered).
  const [local, setLocal] = useState<{ order: string[]; hidden: Set<string> } | null>(null)
  let saved: { order?: string[]; hidden?: string[] } = {}
  try { saved = JSON.parse(a.settings.home_layout ?? '{}') } catch { /* default */ }
  const order = local?.order ?? (saved.order ?? []).filter((id) => ORDER.includes(id))
  if (!local) ORDER.forEach((id, i) => { if (!order.includes(id)) order.splice(Math.min(i, order.length), 0, id) })
  const hidden = local?.hidden ?? new Set(saved.hidden ?? [])
  const save = (o: string[], h: Set<string>) => {
    setLocal({ order: o, hidden: h })
    return write(() => api.putSettings({ home_layout: { order: o, hidden: [...h] } }), 'Saved').then((ok) => { if (!ok) setLocal(null); return ok })
  }
  // Press and hold a row to drag it, like every other list in Settings (it used to step up one place per tap); the
  // reorder button shows handles as well.
  return (
    <DragGroup items={order} keyOf={(id) => id} handles={reorder} onReorder={(next) => save(next, hidden)}
      footer="Press and hold a card to move it. Switch one off to hide it from Home."
      render={(id, handle) => (
        <Row label={names[id][0]} sub={aheadNote(id, order, hidden, names)} chevron={false}
          trailing={handle ?? <Switch value={!hidden.has(id)} onValueChange={(on) => { const h = new Set(hidden); if (on) h.delete(id); else h.add(id); save(order, h) }} />} />
      )} />
  )
}

function Themes() {
  return (
    <View style={{ gap: space.m }}>
      <ThemePicker />
      <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.xs }}>{"Themes follow your phone's light and dark setting. Classic is the original black and white."}</Txt>
    </View>
  )
}

function Server() {
  const { c } = useTheme()
  const { url, set, token, setToken } = useServer()
  const [val, setVal] = useState(url)
  const [tok, setTok] = useState(token)
  const [state, setState] = useState<'idle' | 'checking' | 'ok' | 'fail' | 'token'>('idle')
  const queued = useOutbox((s) => s.items)
  // The new address is tried first and kept only if Tally answers there: a typo used to be saved straight away and
  // left the app talking to nothing. "Use it anyway" is for a server that's down for now.
  // Tested before switching, so the outbox and refetches never go to an address that doesn't answer meanwhile.
  const apply = () => {
    const moved = cleanServer(val) !== url
    set(val)
    setToken(tok)
    if (moved) queryClient.clear() // another server's balances must not show as this one's
    invalidateAll()
  }
  const test = async () => {
    setState('checking')
    try {
      await probe(cleanServer(val), tok.trim())
      apply()
      setState('ok')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch (e) {
      setState(e instanceof ApiError && (e.status === 401 || e.status === 403) ? 'token' : 'fail')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
    }
  }
  return (
    <>
      <Group header="Tally's address" footer="Tally runs on your own server and is reachable only over Tailscale, so keep the Tailscale app connected on this phone. The token is in /etc/tally/env on the server.">
        <View style={{ padding: space.l, gap: space.m }}>
          <TextInput value={val} onChangeText={setVal} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://…"
            placeholderTextColor={c.label3} style={{ fontSize: 17, color: c.label }} />
          <TextInput value={tok} onChangeText={setTok} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Token"
            placeholderTextColor={c.label3} style={{ fontSize: 17, color: c.label }} />
          <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
            <Button label={state === 'checking' ? 'Checking…' : 'Save and test'} onPress={test} style={{ flex: 1 }} />
            {defaultServer && val !== defaultServer && <Button label="Reset" secondary onPress={() => setVal(defaultServer)} />}
          </View>
          {state === 'ok' && <Txt variant="callout" tone="pos">Connected.</Txt>}
          {state === 'token' && <Txt variant="callout" tone="neg">Tally answered but refused the token, so it kept the old one. Copy it again from the server.</Txt>}
          {state === 'fail' && (
            <View style={{ gap: space.xs }}>
              <Txt variant="callout" tone="neg">No answer there, so Tally kept the address it had. Is Tailscale on?</Txt>
              <Tap feedback="opacity" hitSlop={8} onPress={() => { apply(); setState('idle'); toast({ text: 'Address saved' }) }}>
                <Txt variant="callout" style={{ fontWeight: '600' }}>Use it anyway</Txt>
              </Tap>
            </View>
          )}
        </View>
      </Group>
      {queued.length > 0 && (
        <Group header="Waiting to send" footer="These were saved while Tally was unreachable. They send on their own when it's back.">
          {queued.map((q) => (
            <Row key={q.cid} label={q.label} sub={q.error ?? `${formatCents(q.lines.reduce((n, l) => n + l.amount, 0))}, saved ${dayLabel(toISO(new Date(q.at)))}`} chevron={false}
              trailing={<Tap feedback="opacity" onPress={() => { discard(q.cid); toast({ text: 'Discarded' }) }} hitSlop={8}><Txt variant="callout" tone="neg">Discard</Txt></Tap>} />
          ))}
          <Row label="Send now" sf="arrow.up.circle" md="upload" chevron={false} onPress={() => flush(true).then((n) => {
            const refused = useOutbox.getState().items.filter((q) => q.error).length
            toast({ text: n ? `Sent ${n}` : refused ? 'Tally refused these. Discard them, or fix and add them again.' : 'Still unreachable', tone: !n && refused ? 'error' : undefined })
          })} />
        </Group>
      )}
    </>
  )
}

/** How to have Wallet open a new entry after each tap to pay, through an iOS Shortcuts automation and Tally's link. */
function Capture() {
  const scheme = Constants.expoConfig?.scheme ?? 'tally'
  const steps = [
    'Open the Shortcuts app, go to Automation and tap +.',
    'Choose Transaction (Wallet), pick your cards, and set it to Run Immediately.',
    'Add a URL Encode action for the Merchant, so a name like "Barnes & Noble" or "Store #12" stays whole.',
    `Add the action Open URLs with ${scheme}://new?amount=[Amount]&what=[URL Encoded Text]&card=[Card], inserting Amount and Card from the Shortcut Input.`,
    'Next time you tap to pay, Tally opens the new entry filled in, with the category and account from your last visit there. Check it and tap Add.',
  ]
  return (
    <>
      <Group header="Add from Wallet" footer="Any link like this works, from anywhere: amount, what, card and category are each optional.">
        {steps.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.m, padding: space.l }}>
            <Txt variant="headline" num style={{ width: 18 }}>{i + 1}</Txt>
            <Txt variant="callout" style={{ flex: 1 }} selectable>{s}</Txt>
          </View>
        ))}
      </Group>
    </>
  )
}
