// Every Settings list in one route: accounts, categories, quick actions, recurring, saved views, budgets, goals,
// the Home layout, the theme, the app icon and the server. Item editors open as the `edit` modal.
import { useEffect, useState } from 'react'
import { ScrollView, Switch, TextInput, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Icon } from '@/components/Icon'
import { Mark } from '@/components/Mark'
import { Group, Row } from '@/components/Row'
import { StateView } from '@/components/StateView'
import { AppIconPicker } from '@/components/AppIconPicker'
import { ThemePicker } from '@/components/ThemePicker'
import { Button, Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { categoryVisual, KIND_LABEL, KIND_SYMBOL } from '@/icons/categories'
import { useAdmin, write } from '@/lib/admin'
import { api, type AdminData, type CatType, type Kind } from '@/lib/api'
import { suggestBudgets } from '@/lib/budgets'
import { dayLabel } from '@/lib/dates'
import { fromCents, toCents } from '@/lib/draft'
import { formatCents } from '@/lib/money'
import { discard, flush, useOutbox } from '@/lib/outbox'
import { defaultServer, useServer } from '@/lib/server'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { radius, space, useTheme } from '@/theme'

const TITLES: Record<string, string> = {
  accounts: 'Accounts', categories: 'Categories', quick: 'Quick actions', recurring: 'Recurring', views: 'Saved views',
  budgets: 'Budgets', general: 'Goals', home: 'Home screen', server: 'Server', theme: 'Theme', icon: 'App icon',
}

export default function SettingsSection() {
  const { section } = useLocalSearchParams<{ section: string }>()
  const { c } = useTheme()
  const admin = useAdmin()
  const [reorder, setReorder] = useState(false)
  const canAdd = ['accounts', 'categories', 'quick', 'recurring'].includes(section)
  const canOrder = ['accounts', 'categories', 'quick'].includes(section)
  const editKind = { accounts: 'account', categories: 'category', quick: 'quick', recurring: 'recurring' }[section]
  return (
    <>
      <Stack.Screen options={{ title: TITLES[section] ?? 'Settings', headerLargeTitle: false }} />
      {(canAdd || canOrder) && (
        <Stack.Toolbar placement="right">
          {canOrder && <Stack.Toolbar.Button icon={reorder ? 'checkmark' : 'arrow.up.arrow.down'} accessibilityLabel={reorder ? 'Done reordering' : 'Reorder'} onPress={() => setReorder((v) => !v)} />}
          {canAdd && !reorder && <Stack.Toolbar.Button icon="plus" accessibilityLabel="Add" onPress={() => router.push({ pathname: '/edit', params: { kind: editKind! } })} />}
        </Stack.Toolbar>
      )}
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardDismissMode="interactive" style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 100 }}>
        {section === 'server' ? <Server /> : section === 'theme' ? <Themes /> : section === 'icon' ? <AppIconPicker /> : !admin.data ? <StateView q={admin} shape="list" /> : (
          <>
            {section === 'accounts' && <Accounts a={admin.data} reorder={reorder} />}
            {section === 'categories' && <Categories a={admin.data} reorder={reorder} />}
            {section === 'quick' && <Quick a={admin.data} reorder={reorder} />}
            {section === 'recurring' && <RecurringList a={admin.data} />}
            {section === 'views' && <Views a={admin.data} />}
            {section === 'budgets' && <Budgets a={admin.data} />}
            {section === 'general' && <General a={admin.data} />}
            {section === 'home' && <HomeLayout a={admin.data} />}
          </>
        )}
      </ScrollView>
    </>
  )
}

/** Up/down buttons shown while reordering; the new order is saved at once. */
function Mover({ ids, i, save }: { ids: number[]; i: number; save: (ids: number[]) => Promise<unknown> }) {
  const { c } = useTheme()
  const move = (d: number) => {
    const j = i + d
    if (j < 0 || j >= ids.length) return
    const next = [...ids]; [next[i], next[j]] = [next[j], next[i]]
    Haptics.selectionAsync().catch(() => {})
    write(() => save(next))
  }
  return (
    <View style={{ flexDirection: 'row', gap: space.xs }}>
      {[-1, 1].map((d) => (
        <Tap key={d} feedback="opacity" onPress={() => move(d)} disabled={i + d < 0 || i + d >= ids.length} hitSlop={6} accessibilityLabel={d < 0 ? 'Move up' : 'Move down'}
          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center', opacity: i + d < 0 || i + d >= ids.length ? 0.3 : 1 }}>
          <Icon sf={d < 0 ? 'chevron.up' : 'chevron.down'} md={d < 0 ? 'expand_less' : 'expand_more'} size={13} color={c.label} weight="bold" />
        </Tap>
      ))}
    </View>
  )
}

function Hidden() {
  const { c } = useTheme()
  return <View style={{ paddingHorizontal: 8, height: 20, borderRadius: radius.pill, backgroundColor: c.fill, justifyContent: 'center' }}><Txt variant="foot" tone="label2">Hidden</Txt></View>
}

function Accounts({ a, reorder }: { a: AdminData; reorder: boolean }) {
  const { bank } = useTheme()
  const ids = a.accounts.map((x) => x.id)
  return (
    <>
      {(['cash', 'card', 'investment', 'loan'] as Kind[]).map((k) => {
        const list = a.accounts.filter((x) => x.kind === k)
        if (!list.length) return null
        return (
          <Group key={k} header={KIND_LABEL[k]}>
            {list.map((x) => (
              <Row key={x.id} label={x.name} chevron={!reorder}
                leading={<Mark kind="glyph" sf={KIND_SYMBOL[x.kind][0]} md={KIND_SYMBOL[x.kind][1]} tint={bank(x.bank ?? (x.kind === 'investment' ? 'roth' : 'hsa'))} size={30} />}
                trailing={reorder ? <Mover ids={ids} i={ids.indexOf(x.id)} save={api.orderAccounts} /> : !x.active ? <Hidden /> : undefined}
                onPress={reorder ? undefined : () => router.push({ pathname: '/edit', params: { kind: 'account', id: String(x.id) } })} />
            ))}
          </Group>
        )
      })}
    </>
  )
}

function Categories({ a, reorder }: { a: AdminData; reorder: boolean }) {
  const { tint } = useTheme()
  const ids = a.categories.map((x) => x.id)
  return (
    <>
      {(['Spending', 'Money in', 'Transfer', 'Saving', 'Loan'] as CatType[]).map((ty) => {
        const list = a.categories.filter((x) => x.type === ty)
        if (!list.length) return null
        return (
          <Group key={ty} header={ty}>
            {list.map((x) => {
              const v = categoryVisual(x)
              return (
                <Row key={x.id} label={x.name} chevron={!reorder} value={!reorder && x.budget ? `${formatCents(x.budget, { cents: false })}/mo` : undefined}
                  leading={<Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={30} />}
                  trailing={reorder ? <Mover ids={ids} i={ids.indexOf(x.id)} save={api.orderCategories} /> : !x.active ? <Hidden /> : undefined}
                  onPress={reorder ? undefined : () => router.push({ pathname: '/edit', params: { kind: 'category', id: String(x.id) } })} />
              )
            })}
          </Group>
        )
      })}
    </>
  )
}

function Quick({ a, reorder }: { a: AdminData; reorder: boolean }) {
  const { tint } = useTheme()
  const ids = a.favorites.map((x) => x.id)
  const cats = new Map(a.categories.map((x) => [x.id, x]))
  const accts = new Map(a.accounts.map((x) => [x.id, x]))
  if (!a.favorites.length) return <Empty sf="bolt" md="bolt" title="No quick actions" body="A quick action is a one-tap start for an entry you log often, like Gas on the Amex." />
  return (
    <Group footer="Quick actions show on Home and at the top of a new entry.">
      {a.favorites.map((f) => {
        const cat = cats.get(f.category_id)
        const v = cat ? categoryVisual({ ...cat, icon: f.icon ?? cat.icon, color: f.color ?? cat.color }) : null
        const where = [f.from_account_id, f.to_account_id].filter(Boolean).map((id) => accts.get(id!)?.name).join(' → ')
        return (
          <Row key={f.id} label={f.label} sub={[cat?.name, where, f.amount ? formatCents(f.amount) : ''].filter(Boolean).join(', ')} chevron={!reorder}
            leading={v ? <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={30} /> : undefined}
            trailing={reorder ? <Mover ids={ids} i={ids.indexOf(f.id)} save={api.orderFavorites} /> : undefined}
            onPress={reorder ? undefined : () => router.push({ pathname: '/edit', params: { kind: 'quick', id: String(f.id) } })} />
        )
      })}
    </Group>
  )
}

function RecurringList({ a }: { a: AdminData }) {
  const { tint } = useTheme()
  const { b } = useTally()
  const cats = new Map(a.categories.map((x) => [x.id, x]))
  if (!a.recurring.length) return <Empty sf="repeat" md="repeat" title="Nothing recurring yet" body="Add a paycheck, rent or a subscription and Tally posts it ahead of time, about 45 days out." />
  return (
    <Group>
      {a.recurring.map((r) => {
        const cat = cats.get(r.category_id)
        const v = cat ? categoryVisual(cat) : null
        return (
          <Row key={r.id} label={r.label} sub={r.active ? `${r.freq[0].toUpperCase()}${r.freq.slice(1)}, next ${dayLabel(r.next_date, b?.today)}` : 'Paused'}
            value={formatCents(r.amount)} leading={v ? <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={30} /> : undefined}
            onPress={() => router.push({ pathname: '/edit', params: { kind: 'recurring', id: String(r.id) } })} />
        )
      })}
    </Group>
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

/** Default monthly budgets per spending category, with suggestions from recent months. */
function Budgets({ a }: { a: AdminData }) {
  const { c, tint } = useTheme()
  const { b } = useTally()
  const [vals, setVals] = useState<Record<number, string>>({})
  useEffect(() => { setVals(Object.fromEntries(a.categories.map((x) => [x.id, x.budget ? fromCents(x.budget) : '']))) }, [a])
  const suggestions = b ? suggestBudgets(b) : []
  const spending = a.categories.filter((x) => x.type === 'Spending' && x.active)
  const save = (id: number, v: string) => {
    const was = a.categories.find((x) => x.id === id)?.budget ?? null
    const now = v.trim() === '' ? null : toCents(v)
    if (now === was) return
    write(() => api.setBudget(id, now))
  }
  const applySuggestions = async () => {
    const ok = await write(async () => { for (const s of suggestions) await api.setBudget(s.c.id, s.suggested) }, `Set ${suggestions.length} budgets`)
    if (ok) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
  }
  const total = spending.reduce((n, x) => n + toCents(vals[x.id] ?? ''), 0)
  return (
    <>
      {suggestions.length > 0 && (
        <View style={{ padding: space.l, borderRadius: radius.panel, backgroundColor: c.panel, gap: space.m }}>
          <View style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
            <Icon sf="wand.and.stars" md="auto_fix_high" size={20} color={c.label} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="headline">Suggested from your spending</Txt>
              <Txt variant="sub" tone="label2">The average of the last {suggestions[0].months === 1 ? 'month' : `${suggestions[0].months} months`}, rounded up to $10, for {suggestions.length} categories.</Txt>
            </View>
          </View>
          <Button label="Use suggestions" onPress={applySuggestions} />
        </View>
      )}
      <Group header="Monthly budget" footer={total ? `${formatCents(total, { cents: false })} a month across every category. Leave a field empty for no budget.` : 'Leave a field empty for no budget.'}>
        {spending.map((x) => {
          const v = categoryVisual(x)
          const sug = suggestions.find((s) => s.c.id === x.id)
          return (
            <Row key={x.id} label={x.name} chevron={false} sub={sug ? `Usually ${formatCents(sug.average, { cents: false })}` : undefined}
              leading={<Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={30} />}
              value={
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.fill, borderRadius: radius.input, paddingHorizontal: space.m, height: 36, width: 110 }}>
                  <Txt variant="body" tone="label2">$</Txt>
                  <TextInput value={vals[x.id] ?? ''} onChangeText={(t) => setVals((s) => ({ ...s, [x.id]: t.replace(/[^0-9.]/g, '') }))} onBlur={() => save(x.id, vals[x.id] ?? '')} onSubmitEditing={() => save(x.id, vals[x.id] ?? '')}
                    keyboardType="decimal-pad" placeholder="None" placeholderTextColor={c.label3} accessibilityLabel={`${x.name} budget`}
                    style={{ flex: 1, minWidth: 48, fontSize: 17, color: c.label, textAlign: 'right', fontVariant: ['tabular-nums'] }} />
                </View>
              } />
          )
        })}
      </Group>
    </>
  )
}

function General({ a }: { a: AdminData }) {
  const { c } = useTheme()
  const s = a.settings
  const [ef, setEf] = useState(Number(s.ef_months ?? 6))
  const [roth, setRoth] = useState(s.roth_limit ? fromCents(Number(s.roth_limit)) : '')
  const cats = a.categories.filter((x) => x.active)
  const pick = (key: 'roth_category' | 'interest_category', types: CatType[]) => {
    const cur = Number(s[key] ?? 0)
    return cats.filter((x) => types.includes(x.type)).map((x) => (
      <Row key={x.id} label={x.name} chevron={false} onPress={() => write(() => api.putSettings({ [key]: x.id }))}
        trailing={x.id === cur ? <Icon sf="checkmark" md="check" size={16} color={c.ink} weight="bold" /> : undefined} />
    ))
  }
  return (
    <>
      <Group header="Emergency fund" footer="The goal is this many months of your average spending. Accounts marked as emergency fund count toward it.">
        <Row label="Months of spending" chevron={false} value={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
            <Tap feedback="opacity" onPress={() => { const n = Math.max(1, ef - 1); setEf(n); write(() => api.putSettings({ ef_months: n })) }} hitSlop={8} accessibilityLabel="Fewer months"
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' }}><Icon sf="minus" md="remove" size={14} color={c.label} weight="bold" /></Tap>
            <Txt variant="headline" num style={{ minWidth: 22, textAlign: 'center' }}>{ef}</Txt>
            <Tap feedback="opacity" onPress={() => { const n = Math.min(24, ef + 1); setEf(n); write(() => api.putSettings({ ef_months: n })) }} hitSlop={8} accessibilityLabel="More months"
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' }}><Icon sf="plus" md="add" size={14} color={c.label} weight="bold" /></Tap>
          </View>
        } />
      </Group>
      <Group header="Roth IRA yearly limit">
        <Row label="Limit" chevron={false} value={
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.fill, borderRadius: radius.input, paddingHorizontal: space.m, height: 36, width: 120 }}>
            <Txt variant="body" tone="label2">$</Txt>
            <TextInput value={roth} onChangeText={(t) => setRoth(t.replace(/[^0-9.]/g, ''))} onBlur={() => write(() => api.putSettings({ roth_limit: roth || 0 }), 'Saved')}
              keyboardType="decimal-pad" style={{ flex: 1, minWidth: 48, fontSize: 17, color: c.label, textAlign: 'right', fontVariant: ['tabular-nums'] }} />
          </View>
        } />
      </Group>
      <Group header="Roth IRA contributions go to">{pick('roth_category', ['Saving', 'Transfer'])}</Group>
      <Group header="Month-end interest is logged as">{pick('interest_category', ['Money in'])}</Group>
    </>
  )
}

const WIDGET_NAMES: Record<string, string> = {
  networth: 'Net worth', review: 'Month in review', stats: 'This month', quick: 'Quick add', budgets: 'Budgets',
  spending: 'Where it went', ef: 'Emergency fund', upcoming: 'Coming up', recent: 'Recent', roth: 'Roth IRA', chart: 'Net worth over time',
}
const ORDER = Object.keys(WIDGET_NAMES)

function HomeLayout({ a }: { a: AdminData }) {
  let saved: { order?: string[]; hidden?: string[] } = {}
  try { saved = JSON.parse(a.settings.home_layout ?? '{}') } catch { /* default */ }
  const order = (saved.order ?? []).filter((id) => ORDER.includes(id))
  ORDER.forEach((id, i) => { if (!order.includes(id)) order.splice(Math.min(i, order.length), 0, id) })
  const hidden = new Set(saved.hidden ?? [])
  const save = (o: string[], h: Set<string>) => write(() => api.putSettings({ home_layout: { order: o, hidden: [...h] } }))
  const { c } = useTheme()
  return (
    <Group footer="Month in review shows during the first week of a month. Net worth over time appears once there are three months.">
      {order.map((id, i) => (
        <Row key={id} label={WIDGET_NAMES[id]} chevron={false}
          trailing={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
              <Tap feedback="opacity" hitSlop={6} disabled={i === 0} accessibilityLabel="Move up" onPress={() => { const o = [...order]; [o[i - 1], o[i]] = [o[i], o[i - 1]]; save(o, hidden) }}
                style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center', opacity: i === 0 ? 0.3 : 1 }}>
                <Icon sf="chevron.up" md="expand_less" size={12} color={c.label} weight="bold" />
              </Tap>
              <Switch value={!hidden.has(id)} onValueChange={(on) => { const h = new Set(hidden); if (on) h.delete(id); else h.add(id); save(order, h) }} />
            </View>
          } />
      ))}
    </Group>
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
  const { url, set } = useServer()
  const [val, setVal] = useState(url)
  const [state, setState] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle')
  const queued = useOutbox((s) => s.items)
  const test = async () => {
    setState('checking')
    set(val)
    try { await api.bootstrap(); setState('ok'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}) }
    catch { setState('fail'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}) }
  }
  return (
    <>
      <Group header="Tally's address" footer="Tally runs on x1 and is reachable only over Tailscale, so keep the Tailscale app connected on this phone.">
        <View style={{ padding: space.l, gap: space.m }}>
          <TextInput value={val} onChangeText={setVal} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://…"
            placeholderTextColor={c.label3} style={{ fontSize: 17, color: c.label }} />
          <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'center' }}>
            <Button label={state === 'checking' ? 'Checking…' : 'Save and test'} onPress={test} style={{ flex: 1 }} />
            {defaultServer && val !== defaultServer && <Button label="Reset" secondary onPress={() => setVal(defaultServer)} />}
          </View>
          {state === 'ok' && <Txt variant="callout" tone="pos">Connected.</Txt>}
          {state === 'fail' && <Txt variant="callout" tone="neg">No answer. Is Tailscale on?</Txt>}
        </View>
      </Group>
      {queued.length > 0 && (
        <Group header="Waiting to send" footer="These were saved while Tally was unreachable. They send on their own when it's back.">
          {queued.map((q) => (
            <Row key={q.cid} label={q.label} sub={q.error ?? `${formatCents(q.lines.reduce((n, l) => n + l.amount, 0))}, saved ${dayLabel(q.at.slice(0, 10))}`} chevron={false}
              trailing={<Tap feedback="opacity" onPress={() => { discard(q.cid); toast({ text: 'Discarded' }) }} hitSlop={8}><Txt variant="callout" tone="neg">Discard</Txt></Tap>} />
          ))}
          <Row label="Send now" sf="arrow.up.circle" md="upload" chevron={false} onPress={() => flush().then((n) => toast({ text: n ? `Sent ${n}` : 'Still unreachable' }))} />
        </Group>
      )}
    </>
  )
}
