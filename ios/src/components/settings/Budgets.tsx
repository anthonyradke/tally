// Settings → Budgets: the regular monthly budget per spending category, or a one-off for this month or next, with
// suggestions from recent months. A field saves when it's left (Done on the keypad, another field, or going Back).
import { useEffect, useRef, useState } from 'react'
import { TextInput, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { decimalPad, DoneBar } from '@/components/editor/Fields'
import { Icon } from '@/components/Icon'
import { Mark } from '@/components/Mark'
import { Segmented } from '@/components/native/Segmented'
import { Group, Row } from '@/components/Row'
import { Button } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { categoryVisual } from '@/icons/categories'
import { write } from '@/lib/admin'
import { api, type AdminData } from '@/lib/api'
import { suggestBudgets } from '@/lib/budgets'
import { addDays, lastOfMonth, monthOf } from '@/lib/dates'
import { fromCents, toCents } from '@/lib/draft'
import { budgetAmount, budgetIn } from '@/lib/forms'
import { formatCents } from '@/lib/money'
import { useLatest } from '@/lib/nav'
import { useTally } from '@/lib/tally'
import { toast } from '@/lib/toast'
import { radius, space, useTheme } from '@/theme'

type Mode = 'regular' | 'this' | 'next'

export function Budgets({ a }: { a: AdminData }) {
  const { c, tint } = useTheme()
  const { b, today } = useTally()
  const [mode, setMode] = useState<Mode>('regular')
  const months = { this: monthOf(today), next: monthOf(addDays(lastOfMonth(today), 1)) }
  const month = mode === 'regular' ? null : months[mode]
  const monthName = (m: string) => new Date(`${m}T12:00:00`).toLocaleDateString('en-US', { month: 'long' })
  const [vals, setVals] = useState<Record<number, string>>({})
  // Fields being typed in keep their text when fresh data arrives: saving one field (on blur) refetches everything,
  // and that used to wipe what you'd started typing in the next.
  const typing = useRef(new Set<number>())
  useEffect(() => {
    setVals((v) => Object.fromEntries(a.categories.map((x) => {
      const amount = month ? budgetIn(a, x.id, month).over : x.budget
      return [x.id, typing.current.has(x.id) ? v[x.id] ?? '' : amount != null ? fromCents(amount) : '']
    })))
  }, [a, month])
  const suggestions = b ? suggestBudgets(b) : []
  // Suggestions only fill categories with no budget yet: they used to overwrite ones you'd set, in one tap. Each
  // row still shows what it usually is.
  const unset = suggestions.filter((s) => (a.categories.find((x) => x.id === s.c.id)?.budget ?? null) == null)
  const spending = a.categories.filter((x) => x.type === 'Spending' && x.active)
  const save = (id: number, v: string, m: string | null) => {
    typing.current.delete(id)
    const name = a.categories.find((x) => x.id === id)?.name ?? ''
    const was = m ? budgetIn(a, id, m).over : a.categories.find((x) => x.id === id)?.budget ?? null
    const now = budgetAmount(v)
    if (now === undefined) { toast({ text: `Check the ${name} budget: it isn't a number.`, tone: 'error' }); return }
    if (now === was) return
    write(() => api.setBudget(id, now, m ?? undefined), m ? `Saved ${name} for ${monthName(m)}` : `Saved ${name}`)
  }
  // Going Back while a field still has the keyboard didn't always blur it, so what was typed there was lost. Anything
  // still being typed saves when the screen goes, or when the month switches.
  const pending = useLatest(() => { for (const id of [...typing.current]) save(id, vals[id] ?? '', month) })
  useEffect(() => () => pending.current(), [pending])
  const switchTo = (m: Mode) => { pending.current(); setMode(m) }
  const applySuggestions = async () => {
    const list = unset
    const ok = await write(async () => { for (const s of list) await api.setBudget(s.c.id, s.suggested) })
    if (!ok) return
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    toast({
      text: `Set ${list.length === 1 ? '1 budget' : `${list.length} budgets`}`,
      action: { label: 'Undo', run: async () => { await write(async () => { for (const s of list) await api.setBudget(s.c.id, null) }) } },
    })
  }
  const total = spending.reduce((n, x) => n + (vals[x.id] ? toCents(vals[x.id]) : month ? budgetIn(a, x.id, month).regular ?? 0 : 0), 0)
  const footer = month
    ? `${total ? `${formatCents(total, { cents: false })} in ${monthName(month)}. ` : ''}A one-off replaces the regular budget for ${monthName(month)} only. Leave it empty to use the regular one.`
    : `${total ? `${formatCents(total, { cents: false })} a month across every category. ` : ''}Leave a field empty for no budget.`
  return (
    <>
      <DoneBar />
      <Segmented options={[['regular', 'Regular'], ['this', monthName(months.this)], ['next', monthName(months.next)]]} value={mode} onChange={switchTo} />
      {mode === 'regular' && unset.length > 0 && (
        <View style={{ padding: space.l, borderRadius: radius.panel, backgroundColor: c.panel, gap: space.m }}>
          <View style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
            <Icon sf="wand.and.stars" md="auto_fix_high" size={20} color={c.label} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="headline">Suggested from your spending</Txt>
              <Txt variant="sub" tone="label2">The average of the last {unset[0].months === 1 ? 'month' : `${unset[0].months} months`}, rounded up to $10, for {unset.length === 1 ? 'the category' : `the ${unset.length} categories`} with no budget yet.</Txt>
            </View>
          </View>
          <Button label={unset.length === 1 ? 'Use the suggestion' : `Use ${unset.length} suggestions`} onPress={applySuggestions} />
        </View>
      )}
      <Group header={month ? `Just for ${monthName(month)}` : 'Monthly budget'} footer={footer}>
        {spending.map((x) => {
          const v = categoryVisual(x)
          const sug = suggestions.find((s) => s.c.id === x.id)
          const { regular, over } = budgetIn(a, x.id, months.this)
          const sub = month
            ? regular != null ? `Regular ${formatCents(regular, { cents: false })}` : 'No regular budget'
            : [over != null ? `${formatCents(over, { cents: false })} this month` : '', sug ? `Usually ${formatCents(sug.average, { cents: false })}` : ''].filter(Boolean).join(', ') || undefined
          const placeholder = month && regular != null ? fromCents(regular) : 'None'
          return (
            <Row key={x.id} label={x.name} chevron={false} sub={sub}
              leading={<Mark kind="glyph" sf={v.sf} md={v.md} tint={tint(v.tint)} size={30} />}
              value={
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.fill, borderRadius: radius.input, paddingHorizontal: space.m, height: 36, width: 110 }}>
                  <Txt variant="body" tone="label2">$</Txt>
                  <TextInput value={vals[x.id] ?? ''} onChangeText={(t) => { typing.current.add(x.id); setVals((s) => ({ ...s, [x.id]: t.replace(/[^0-9.]/g, '') })) }}
                    onBlur={() => save(x.id, vals[x.id] ?? '', month)} onSubmitEditing={() => save(x.id, vals[x.id] ?? '', month)}
                    {...decimalPad} placeholder={placeholder} placeholderTextColor={c.label3} accessibilityLabel={`${x.name} budget${month ? ` for ${monthName(month)}` : ''}`}
                    style={{ flex: 1, minWidth: 48, fontSize: 17, color: c.label, textAlign: 'right', fontVariant: ['tabular-nums'] }} />
                </View>
              } />
          )
        })}
      </Group>
    </>
  )
}
