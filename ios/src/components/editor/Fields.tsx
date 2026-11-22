// The pieces the Settings editors are built from: a labelled text field, a switch row, a row that opens its options
// inline, and the Done bar that sits on the decimal pad (which has no return key of its own).
import { useState, type ReactNode } from 'react'
import { InputAccessoryView, Keyboard, Switch, TextInput, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Icon } from '@/components/Icon'
import { Row } from '@/components/Row'
import { Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { space, useTheme } from '@/theme'

/** The id the decimal fields point their keyboard's accessory at. A screen with any renders one <DoneBar />. */
export const DONE_BAR = 'tally.done'
const ios = process.env.EXPO_OS === 'ios'

/** A bar above the decimal pad with Done, which closes the keyboard (and so saves a field that saves on blur). */
export function DoneBar() {
  const { c } = useTheme()
  if (!ios) return null
  return (
    <InputAccessoryView nativeID={DONE_BAR}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space.l, paddingVertical: space.s, backgroundColor: c.panelRaised, borderTopWidth: 0.5, borderTopColor: c.sep }}>
        <Tap feedback="opacity" hitSlop={10} onPress={() => Keyboard.dismiss()} accessibilityLabel="Done">
          <Txt variant="body" style={{ fontWeight: '600', color: c.ink }}>Done</Txt>
        </Tap>
      </View>
    </InputAccessoryView>
  )
}

/** Props for a decimal TextInput: the pad plus the Done bar. */
export const decimalPad = { keyboardType: 'decimal-pad', inputAccessoryViewID: ios ? DONE_BAR : undefined } as const

export function Field({ label, value, onChange, money, pct, placeholder, auto }: { label: string; value: string; onChange: (v: string) => void; money?: boolean; pct?: boolean; placeholder?: string; auto?: boolean }) {
  const { c } = useTheme()
  const num = money || pct
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, minHeight: 50 }}>
      <Txt variant="body" style={{ width: 118 }}>{label}</Txt>
      {money && <Txt variant="body" tone="label2">$</Txt>}
      <TextInput value={value} onChangeText={(v) => onChange(num ? v.replace(/[^0-9.\-]/g, '') : v)} placeholder={placeholder ?? (money ? '0.00' : '')}
        placeholderTextColor={c.label3} {...(num ? decimalPad : {})} autoCapitalize={auto ? 'words' : 'sentences'} accessibilityLabel={label}
        style={{ flex: 1, fontSize: 17, color: c.label, paddingVertical: space.m, fontVariant: num ? ['tabular-nums'] : undefined }} />
      {pct && <Txt variant="body" tone="label2">%</Txt>}
    </View>
  )
}

export function Toggle({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return <Row label={label} sub={sub} chevron={false} trailing={<Switch value={value} onValueChange={onChange} />} />
}

export interface Option<T> { value: T; label: string; leading?: ReactNode }

/** A row that opens an inline list of options under it. */
export function Choice<T extends string | number | null>({ label, value, options, onChange, leading }: {
  label: string; value: T; options: Option<T>[]; onChange: (v: T) => void; leading?: ReactNode
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

/** Picker options from a list that can hide items: the visible ones, plus the current one if it's hidden, named so
 *  ("Credit card (hidden)"). It used to read "Choose" while the item still saved to the hidden one. */
export function withHidden<T extends { id: number; name: string; active: number | boolean }>(all: T[], current: number | null, make: (x: T, label: string) => Option<number | null>): Option<number | null>[] {
  return all.filter((x) => x.active || x.id === current).map((x) => make(x, x.active ? x.name : `${x.name} (hidden)`))
}
