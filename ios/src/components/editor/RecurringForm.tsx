// The recurring editor's fields, and its one-tap actions (pause or resume, skip the next date) that act at once with
// Undo, like the swipe actions on the list. The Next date is the next one that will happen, the one the list shows.
import { View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { DatePick } from '@/components/native/DatePick'
import { Segmented } from '@/components/native/Segmented'
import { Group, Row } from '@/components/Row'
import { Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { write } from '@/lib/admin'
import { api, type AdminData, type Freq } from '@/lib/api'
import { dayLabel } from '@/lib/dates'
import type { Form } from '@/lib/forms'
import { useBusy } from '@/lib/nav'
import { dueOf, skipLabel, skipNext, togglePause } from '@/lib/recurringActions'
import { useTally } from '@/lib/tally'
import { space } from '@/theme'
import { Field } from './Fields'
import { Pickers } from './Pickers'

export function RecurringForm({ f, set, a, id }: { f: Form; set: (p: Form) => void; a: AdminData; id?: number }) {
  const t = useTally()
  return (
    <>
      <Group>
        <Field label="Label" value={String(f.label)} onChange={(v) => set({ label: v, what: !f.what || f.what === f.label ? v : f.what })} auto placeholder="Rent" />
        <Field label="Shows as" value={String(f.what ?? '')} onChange={(v) => set({ what: v })} auto placeholder="What entries are called" />
        <Field label="Amount" value={String(f.amount ?? '')} onChange={(v) => set({ amount: v })} money />
      </Group>
      <Group><Pickers f={f} set={set} a={a} /></Group>
      <Segmented options={[['weekly', 'Weekly'], ['biweekly', 'Every 2 wk'], ['monthly', 'Monthly'], ['yearly', 'Yearly']]} value={f.freq as Freq} onChange={(v) => set({ freq: v })} />
      <View style={{ gap: space.s }}>
        <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.l }}>Next date</Txt>
        <DatePick value={String(f.next_date)} onChange={(v) => set({ next_date: v })} min={id ? t.today : undefined} />
        <Txt variant="foot" tone="label2" style={{ paddingHorizontal: space.l, lineHeight: 16 }}>
          {id ? 'Saving updates its entries still ahead; ones dated today or earlier, or changed by hand, stay as they are. A new date posts them again from that day.' : 'The first one posts on this day, then on the same schedule after it.'}
        </Txt>
      </View>
    </>
  )
}

/** Pause or resume, and skip one date, each at once with Undo. `onActive` keeps the open form in step, so saving it
 *  afterwards doesn't undo the pause. */
export function RecurringActions({ id, a, onActive }: { id: number; a: AdminData; onActive: (on: boolean) => void }) {
  const t = useTally()
  const once = useBusy()
  const r = a.recurring.find((x) => x.id === id)
  if (!r) return null
  const skipped = a.skips.filter((x) => x.recurring_id === id)
  const pause = () => once(async () => { if (await togglePause(r, t.today)) onActive(!r.active) })
  const skip = () => once(async () => { if (await skipNext(r, t.today)) Haptics.selectionAsync().catch(() => {}) })
  return (
    <Group footer={r.active ? `Pausing takes out its entries still ahead; resuming skips the dates missed meanwhile. Skipping leaves the template as it is, say for a bill paid another way this time.` : `Paused: nothing posts until it's resumed, and it then skips the dates missed meanwhile.`}>
      <Row label={r.active ? 'Pause' : 'Resume'} sub={r.active ? undefined : `Next would be ${dayLabel(dueOf(r), t.today)}`} sf={r.active ? 'pause.circle' : 'play.circle'} md={r.active ? 'pause_circle' : 'play_circle'} chevron={false} onPress={pause} />
      {!!r.active && <Row label={skipLabel(r, t.today)} sf="forward.end" md="skip_next" chevron={false} onPress={skip} />}
      {skipped.map((x) => (
        <Row key={x.date} label={`Skipping ${dayLabel(x.date, t.today)}`} chevron={false}
          trailing={<Tap feedback="opacity" hitSlop={8} onPress={() => once(() => write(() => api.unskipRecurring(id, x.date), 'It will post again'))}>
            <Txt variant="callout" style={{ fontWeight: '600' }}>Undo</Txt></Tap>} />
      ))}
    </Group>
  )
}
