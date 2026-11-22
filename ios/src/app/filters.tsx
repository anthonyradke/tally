// Activity's filters, as a sheet over the list: search, type, dates, sort, category, account, tag, saved views, and
// ways into Settings for the chip rows Activity shows and Recently deleted.
import { useState } from 'react'
import { ScrollView, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { Chip } from '@/components/Chip'
import { Icon } from '@/components/Icon'
import { Mark } from '@/components/Mark'
import { TagChips } from '@/components/TagChips'
import { Group, Row } from '@/components/Row'
import { Button, Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { categoryVisual } from '@/icons/categories'
import { api, type SavedView } from '@/lib/api'
import { close, useBusy } from '@/lib/nav'
import { invalidateAll } from '@/lib/data'
import { activeRange, ranges, SORTS, TYPES } from '@/lib/filterBar'
import { extraCount, fromViewQuery, isView, tagChoices, tagOf, useFilters, viewQuery } from '@/lib/filters'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { radius, space, useTheme } from '@/theme'

export default function FiltersSheet() {
  const { c, tint } = useTheme()
  const t = useTally()
  const { f, set, reset, view } = useFilters()
  const [pickCat, setPickCat] = useState(false)
  const [pickAcct, setPickAcct] = useState(false)
  const [viewName, setViewName] = useState('')
  // The field keeps what's typed ("#Trip"); the filter gets it tidied. Writing the tidied text back into the field
  // moved the cursor and made "#" impossible to type.
  const [tagText, setTagText] = useState(f.tag ?? '')
  const busy = useBusy()
  if (!t.b) return null
  const today = t.b.today
  const active = activeRange(f, today)
  const cat = f.category ? t.cat.get(f.category) : undefined
  const acct = f.account ? t.acct.get(f.account) : undefined
  const check = <Icon sf="checkmark" md="check" size={16} color={c.ink} weight="bold" />
  const typeTag = (v: string) => { setTagText(v); set({ tag: tagOf(v) }) }

  const saveView = () => busy(async () => { // once, however many taps
    const name = viewName.trim()
    try {
      const v = await api.saveView({ name, query: viewQuery(f, today) })
      useFilters.setState({ view: v.id }) // it's the view that's on now
      await invalidateAll(); setViewName(''); toast({ text: `Saved "${name}"` })
    } catch { toast({ text: 'Could not save the view.', tone: 'error' }) }
  })
  const updateView = (v: SavedView) => busy(async () => {
    try { await api.saveView({ name: v.name, query: viewQuery(f, today), icon: v.icon, sort: v.sort }, v.id); await invalidateAll(); toast({ text: `Updated "${v.name}"` }) }
    catch { toast({ text: 'Could not update the view.', tone: 'error' }) }
  })
  const applyView = (v: SavedView) => {
    useFilters.getState().replace(fromViewQuery(v.query, today), v.id)
    setTagText(useFilters.getState().f.tag ?? '')
    close()
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space.l, paddingTop: space.xl, gap: space.xl, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      {/* Its height kept for Reset, so the first filter turned on doesn't push the sheet down. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 34 }}>
        <Txt variant="title2" accessibilityRole="header">Filters</Txt>
        {/* Everything off, search and type too, the same as Activity's Clear filters. */}
        {(extraCount(f) > 0 || !!f.q || !!f.type) && <Button label="Reset" secondary onPress={() => { setTagText(''); reset() }} style={{ height: 34, paddingHorizontal: space.l }} />}
      </View>

      {/* Always there, dimmed with no search: clearing it used to pull everything below up under the finger. */}
      <Group>
        <View style={{ opacity: f.q ? 1 : 0.5 }}>
          <Row label="Search" sf="magnifyingglass" md="search" value={f.q ? `“${f.q}”` : 'No search'} chevron={false}
            trailing={f.q ? (
              <Tap feedback="opacity" onPress={() => set({ q: '' })} hitSlop={10} accessibilityLabel="Clear search">
                <Icon sf="xmark.circle.fill" md="cancel" size={20} color={c.label3} />
              </Tap>
            ) : <View style={{ width: 20 }} />} />
        </View>
      </Group>

      <View style={{ gap: space.s }}>
        <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.xs }}>Type</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          <Chip label="All" selected={!f.type} onPress={() => set({ type: '' })} />
          {TYPES.map(([ty, label]) => <Chip key={ty} label={label} selected={f.type === ty} onPress={() => set({ type: ty })} />)}
        </View>
      </View>

      <View style={{ gap: space.s }}>
        <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.xs }}>When</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          {ranges(today).map(([k, label, p]) => <Chip key={k} label={label} selected={active === k} onPress={() => set(p)} />)}
        </View>
      </View>

      <View style={{ gap: space.s }}>
        <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.xs }}>Sort</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          {SORTS.map(([k, label, s]) => <Chip key={k} label={label} selected={f.sort === s.sort && f.dir === s.dir} onPress={() => set(s)} />)}
        </View>
      </View>

      <Group>
        <Row label="Category" value={cat?.name ?? 'Any'} onPress={() => setPickCat((v) => !v)}
          leading={cat ? (() => { const v = categoryVisual(cat); return <Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={28} /> })() : <Icon sf="square.grid.2x2" md="category" size={18} color={c.label2} />} />
        {pickCat && [<Row key="any" label="Any category" chevron={false} onPress={() => { set({ category: undefined }); setPickCat(false) }} />,
          ...t.b.categories.filter((x) => x.active || x.id === f.category).map((x) => {
            const v = categoryVisual(x)
            return <Row key={x.id} label={x.name} chevron={false} leading={<Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={28} />}
              trailing={x.id === f.category ? check : undefined}
              onPress={() => { set({ category: x.id }); setPickCat(false) }} />
          })]}
        <Row label="Account" value={acct?.name ?? 'Any'} sf="building.columns" md="account_balance" onPress={() => setPickAcct((v) => !v)} />
        {pickAcct && [<Row key="any" label="Any account" chevron={false} onPress={() => { set({ account: undefined }); setPickAcct(false) }} />,
          ...t.b.accounts.filter((a) => a.active || a.id === f.account).map((a) => (
            <Row key={a.id} label={a.name} chevron={false} trailing={a.id === f.account ? check : undefined}
              onPress={() => { set({ account: a.id }); setPickAcct(false) }} />
          ))]}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, minHeight: 50 }}>
            <Icon sf="number" md="tag" size={18} color={c.label2} />
            <TextInput value={tagText} placeholder="Tag" placeholderTextColor={c.label3} autoCapitalize="none" autoCorrect={false}
              onChangeText={typeTag} style={{ flex: 1, fontSize: 17, color: c.label }} />
          </View>
          {/* The tags in use, so one is picked whole; the lit one is the filter, and tapping it lets go. The row keeps
              its height while nothing matches what's typed, so the sheet doesn't move under the finger. */}
          {!!t.b.tags?.length && (
            <View style={{ height: 36, marginBottom: space.m }}>
              <TagChips tags={tagChoices(t.b.tags, tagText)} selected={f.tag} onDark onPick={(tag) => typeTag(tag === f.tag ? '' : tag)} />
            </View>
          )}
        </View>
      </Group>

      <View style={{ gap: space.s }}>
        <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.xs }}>Saved views</Txt>
        {t.b.saved_views.length > 0 && (
          <Group>
            {t.b.saved_views.map((v) => {
              // The view that's on is ticked; once the filters move on from it, it offers to take them.
              const on = isView(v.query, f, today)
              const offer = !on && view === v.id
              const row = <Row label={v.name} sf={on ? 'bookmark.fill' : 'bookmark'} md="bookmark" onPress={() => applyView(v)} chevron={!on && !offer} trailing={on ? check : undefined} />
              if (!offer) return <View key={v.id}>{row}</View>
              // Update sits beside the row, not inside its button: a button within a button can't be reached on
              // its own with VoiceOver, and a tap on it could apply the view instead.
              return (
                <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>{row}</View>
                  <Tap feedback="opacity" onPress={() => updateView(v)} hitSlop={8} accessibilityLabel={`Update ${v.name} to these filters`}
                    style={{ marginRight: space.l, paddingHorizontal: space.m, height: 30, borderRadius: radius.pill, backgroundColor: c.fill, justifyContent: 'center' }}>
                    <Txt variant="sub" style={{ fontWeight: '600' }}>Update</Txt>
                  </Tap>
                </View>
              )
            })}
          </Group>
        )}
        <View style={{ flexDirection: 'row', gap: space.s }}>
          <TextInput value={viewName} onChangeText={setViewName} placeholder="Name these filters" placeholderTextColor={c.label3}
            style={{ flex: 1, height: 44, borderRadius: radius.input, backgroundColor: c.panel, paddingHorizontal: space.l, fontSize: 17, color: c.label }} />
          <Button label="Save" onPress={saveView} disabled={!viewName.trim()} />
        </View>
      </View>

      <Group footer="Pick which chip rows sit above the list on Activity, and their order.">
        <Row label="Customize filter bar" sf="slider.horizontal.3" md="tune" onPress={() => { close(); router.push('/settings/activity') }} />
      </Group>

      <Group footer="Entries deleted in the last 30 days, ready to put back.">
        <Row label="Recently deleted" sf="trash" md="delete" onPress={() => { close(); router.push('/settings/deleted') }} />
      </Group>

      <Button label="Show results" onPress={() => close()} style={{ height: 52 }} />
    </ScrollView>
  )
}
