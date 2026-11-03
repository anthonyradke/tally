// Activity's filters, as a sheet over the list: dates, sort, category, account, tag, saved views, and a way into
// Settings to choose the chip rows Activity shows.
import { useState } from 'react'
import { ScrollView, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { Chip } from '@/components/Chip'
import { Icon } from '@/components/Icon'
import { Mark } from '@/components/Mark'
import { Group, Row } from '@/components/Row'
import { Button } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { categoryVisual } from '@/icons/categories'
import { api } from '@/lib/api'
import { close } from '@/lib/nav'
import { invalidateAll } from '@/lib/data'
import { activeRange, ranges, SORTS } from '@/lib/filterBar'
import { extraCount, fromViewQuery, useFilters, viewQuery } from '@/lib/filters'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { radius, space, useTheme } from '@/theme'

export default function FiltersSheet() {
  const { c, tint } = useTheme()
  const t = useTally()
  const { f, set, reset } = useFilters()
  const [pickCat, setPickCat] = useState(false)
  const [pickAcct, setPickAcct] = useState(false)
  const [viewName, setViewName] = useState('')
  if (!t.b) return null
  const active = activeRange(f, t.b.today)
  const cat = f.category ? t.cat.get(f.category) : undefined
  const acct = f.account ? t.acct.get(f.account) : undefined

  const saveView = async () => {
    try { await api.saveView({ name: viewName.trim(), query: viewQuery(f) }); await invalidateAll(); setViewName(''); toast({ text: `Saved "${viewName.trim()}"` }) }
    catch { toast({ text: 'Could not save the view.', tone: 'error' }) }
  }
  const applyView = (query: string) => {
    reset()
    set(fromViewQuery(query))
    close()
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space.l, paddingTop: space.xl, gap: space.xl, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt variant="title2" accessibilityRole="header">Filters</Txt>
        {extraCount(f) > 0 && <Button label="Reset" secondary onPress={() => set({ category: undefined, account: undefined, start: undefined, end: undefined, tag: undefined, group: undefined, sort: 'date', dir: 'desc' })} style={{ height: 34, paddingHorizontal: space.l }} />}
      </View>

      <View style={{ gap: space.s }}>
        <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.xs }}>When</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          {ranges(t.b.today).map(([k, label, p]) => <Chip key={k} label={label} selected={active === k} onPress={() => set(p)} />)}
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
          ...t.b.categories.filter((x) => x.active).map((x) => {
            const v = categoryVisual(x)
            return <Row key={x.id} label={x.name} chevron={false} leading={<Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={28} />}
              trailing={x.id === f.category ? <Icon sf="checkmark" md="check" size={16} color={c.ink} weight="bold" /> : undefined}
              onPress={() => { set({ category: x.id }); setPickCat(false) }} />
          })]}
        <Row label="Account" value={acct?.name ?? 'Any'} sf="building.columns" md="account_balance" onPress={() => setPickAcct((v) => !v)} />
        {pickAcct && [<Row key="any" label="Any account" chevron={false} onPress={() => { set({ account: undefined }); setPickAcct(false) }} />,
          ...t.b.accounts.filter((a) => a.active || a.id === f.account).map((a) => (
            <Row key={a.id} label={a.name} chevron={false} trailing={a.id === f.account ? <Icon sf="checkmark" md="check" size={16} color={c.ink} weight="bold" /> : undefined}
              onPress={() => { set({ account: a.id }); setPickAcct(false) }} />
          ))]}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, minHeight: 50 }}>
          <Icon sf="number" md="tag" size={18} color={c.label2} />
          <TextInput value={f.tag ?? ''} placeholder="Tag" placeholderTextColor={c.label3} autoCapitalize="none" autoCorrect={false}
            onChangeText={(v) => set({ tag: v.trim().replace(/^#/, '').toLowerCase() || undefined })} style={{ flex: 1, fontSize: 17, color: c.label }} />
        </View>
      </Group>

      <View style={{ gap: space.s }}>
        <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.xs }}>Saved views</Txt>
        {t.b.saved_views.length > 0 && (
          <Group>
            {t.b.saved_views.map((v) => <Row key={v.id} label={v.name} sf="bookmark" md="bookmark" onPress={() => applyView(v.query)} />)}
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

      <Button label="Show results" onPress={() => close()} style={{ height: 52 }} />
    </ScrollView>
  )
}
