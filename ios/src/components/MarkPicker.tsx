// A place's logo, chosen on its page: Automatic (Tally recognizes the name), a brand from the list, a letter on one
// of the category colors, or no logo (the category's symbol). Saved in the `merchant_marks` setting, keyed by the
// place's name, so every entry with that name follows.
import { useState } from 'react'
import { View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { MARK_OPTIONS, overrideKey, parseOverrides, specFor } from '@/icons/merchants'
import { write } from '@/lib/admin'
import { api } from '@/lib/api'
import { play } from '@/lib/sound'
import { useTally } from '@/lib/tally'
import { radius, space, TINTS, useTheme } from '@/theme'
import { Chip } from './Chip'
import { Icon } from './Icon'
import { Mark } from './Mark'
import { Panel, Section } from './Panel'
import { Tap } from './Tap'
import { Txt } from './Txt'

export function MarkPicker({ what, merchant }: { what: string; merchant: string }) {
  const { c } = useTheme()
  const t = useTally()
  const [all, setAll] = useState(false)
  const o = parseOverrides(t.b?.settings.merchant_marks)
  const k = overrideKey(what, o)
  const cur = k && o[k] !== 'auto' ? o[k] : null // null: automatic
  const choose = (value: string | null) => {
    Haptics.selectionAsync().catch(() => {})
    play('tick', 0.6)
    const next = { ...o }
    delete next[merchant]
    if (value) next[merchant] = value
    // Automatic under a logo set for a shorter name ("Costco" covering "Costco Gas") needs saying so for this one.
    else if (k && k !== merchant) next[merchant] = 'auto'
    write(() => api.putSettings({ merchant_marks: next }))
  }
  const brands = all ? MARK_OPTIONS : MARK_OPTIONS.slice(0, 12)
  return (
    <Section title="Logo">
      <Panel style={{ gap: space.l }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          <Chip label="Automatic" selected={cur == null} onDark onPress={() => choose(null)} />
          <Chip label="Category symbol" selected={cur === 'category'} onDark onPress={() => choose('category')} />
        </View>
        <View style={{ gap: space.s }}>
          <Txt variant="sub" tone="label2">A letter</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {TINTS.map((tn) => {
              const v = `tint:${tn}`
              return (
                <Pick key={tn} on={cur === v} label={`Letter on ${tn}`} onPress={() => choose(v)}>
                  <Mark kind="spec" spec={specFor(v, what)!} size={40} />
                </Pick>
              )
            })}
          </View>
        </View>
        <View style={{ gap: space.s }}>
          <Txt variant="sub" tone="label2">A brand</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {brands.map((m) => (
              <Pick key={m.id} on={cur === m.id} label={m.spec.title} onPress={() => choose(m.id)}>
                <Mark kind="spec" spec={m.spec} size={40} />
              </Pick>
            ))}
          </View>
          {!all && (
            <Tap feedback="opacity" onPress={() => setAll(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: space.xs }}>
              <Txt variant="callout" style={{ fontWeight: '600' }}>Show all {MARK_OPTIONS.length}</Txt>
              <Icon sf="chevron.down" md="expand_more" size={12} color={c.label} />
            </Tap>
          )}
        </View>
      </Panel>
    </Section>
  )
}

function Pick({ on, label, onPress, children }: { on: boolean; label: string; onPress: () => void; children: React.ReactNode }) {
  const { c } = useTheme()
  return (
    <Tap feedback="scale" onPress={onPress} accessibilityLabel={label} accessibilityState={{ selected: on }}
      style={{ padding: 3, borderRadius: radius.pill, borderWidth: 2, borderColor: on ? c.ink : 'transparent' }}>
      {children}
    </Tap>
  )
}
