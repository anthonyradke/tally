// Waiting to Send: entries saved on the phone while Tally couldn't be reached, each with why it hasn't gone yet.
// Send Now tries them all again (refused ones too); a row swipes left to discard it, with Undo.
import { ScrollView, View } from 'react-native'
import Animated, { FadeOut } from 'react-native-reanimated'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { dayLabel } from '@/lib/dates'
import { discard, enqueue, flush, useOutbox, type Queued } from '@/lib/outbox'
import { useServer } from '@/lib/server'
import { useBusy } from '@/design/busy'
import { failure, success, thump, warning } from '@/design/haptics'
import { useLedger } from '@/design/ledger'
import { amountLook } from '@/design/look'
import { SETTLE } from '@/design/motion'
import { space, usePalette } from '@/design/theme'
import { Button } from '@/design/ui/Button'
import { Empty, Section } from '@/design/ui/List'
import { Money } from '@/design/ui/Money'
import { notify } from '@/design/ui/Notice'
import { Press } from '@/design/ui/Press'
import { Txt } from '@/design/ui/Txt'

function Entry({ q, elsewhere }: { q: Queued; elsewhere: boolean }) {
  const p = usePalette()
  const L = useLedger()
  const first = q.lines[0]
  const total = q.lines.reduce((n, x) => n + x.amount, 0)
  const amt = amountLook(first ? L.cat.get(first.category_id)?.type : undefined, total)
  const drop = () => {
    warning()
    discard(q.cid)
    // Putting it back saves it for the address in use now, so only offer that when it was saved for this one.
    notify({ text: `Discarded ${q.label}`, symbol: 'trash.fill', hue: 'red',
      action: elsewhere ? undefined : { label: 'Undo', run: () => { enqueue({ cid: q.cid, lines: q.lines, label: q.label, error: q.error }); success() } } })
  }
  const note = elsewhere ? 'Saved for another server' : q.error
  return (
    <Animated.View exiting={FadeOut.duration(180)} layout={SETTLE}>
      <ReanimatedSwipeable friction={1.6} rightThreshold={80} overshootRight={false} onSwipeableWillOpen={() => thump()}
        renderRightActions={() => (
          <Press feel="none" onPress={drop} accessibilityLabel={`Discard ${q.label}`}
            style={{ width: 96, backgroundColor: p.red, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="subhead" weight="600" color="#FFFFFF">Discard</Txt>
          </Press>
        )}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: 10, minHeight: 60, backgroundColor: p.card }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="body" numberOfLines={1}>{q.label}</Txt>
            <Txt v="subhead" tone="label2" numberOfLines={1}>{first ? dayLabel(first.date, L.today) : ''}{q.lines.length > 1 ? ` · Split in ${q.lines.length}` : ''}</Txt>
            {note ? <Txt v="footnote" tone={q.error ? 'red' : 'label2'} numberOfLines={3}>{note}</Txt> : null}
          </View>
          <Money cents={amt.cents} plus={amt.plus} tone={amt.tone} />
        </View>
      </ReanimatedSwipeable>
    </Animated.View>
  )
}

export default function Outbox() {
  const p = usePalette()
  const items = useOutbox((s) => s.items)
  const server = useServer((s) => s.url)
  const busy = useBusy()
  const sendNow = () => busy.run(async () => {
    try {
      const sent = await flush(true)
      const left = useOutbox.getState().items.filter((x) => !x.url || x.url === server)
      if (sent && !left.length) { success(); notify({ text: `Sent ${sent}`, symbol: 'checkmark.circle.fill' }) }
      else if (sent) { warning(); notify({ text: `Sent ${sent} · ${left.length} Still Waiting`, symbol: 'exclamationmark.triangle.fill', hue: 'orange' }) }
      else { failure(); notify({ text: left.some((x) => x.error) ? 'Tally Refused Them' : 'Tally Can’t Be Reached', symbol: 'exclamationmark.triangle.fill', hue: 'orange' }) }
    } catch {
      failure()
      notify({ text: 'Couldn’t Send', symbol: 'exclamationmark.triangle.fill', hue: 'orange' })
    }
  })
  if (!items.length) return <Empty symbol="tray" title="Nothing Waiting" body="Everything saved on this phone is in Tally." />
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }} contentContainerStyle={{ padding: space.l, gap: space.xxl, paddingBottom: 60 }}>
      <Section compact footer="Saved on this phone while Tally couldn’t be reached. Swipe left to discard one.">
        {items.map((q) => <Entry key={q.cid} q={q} elsewhere={!!q.url && q.url !== server} />)}
      </Section>
      <Button label="Send Now" onPress={sendNow} busy={busy.on} />
    </ScrollView>
  )
}
