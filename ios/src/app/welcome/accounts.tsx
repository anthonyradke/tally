// Setup, step two: the accounts Tally will make from the banks, each with its bank's logo and balance. Untick any to
// leave out, tap a name to rename it, then choose how far back to start.
import { Alert, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api, ApiError, type SetupAccount } from '@/lib/api'
import { queryClient } from '@/lib/data'
import { fromISO } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { useBusy } from '@/design/busy'
import { why } from '@/design/checkin'
import { failure, tick } from '@/design/haptics'
import { KIND_LOOK } from '@/design/look'
import { leaveWelcome, useChoices, useSetupStatus } from '@/design/setup'
import { space, usePalette } from '@/design/theme'
import { Button } from '@/design/ui/Button'
import { Empty, Row, Section } from '@/design/ui/List'
import { Logo } from '@/design/ui/Logo'
import { notify } from '@/design/ui/Notice'
import { Press } from '@/design/ui/Press'
import { SF } from '@/design/ui/SF'
import { Txt } from '@/design/ui/Txt'

const since = (iso: string) => fromISO(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

export default function Accounts() {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const s = useSetupStatus()
  const c = useChoices()
  const busy = useBusy()
  const items = s.data?.items ?? []
  const all = items.flatMap((it) => it.accounts).filter((a) => a.kind)
  const on = (a: SetupAccount) => !c.off[a.id]
  const firsts = all.filter((a) => on(a) && a.first && (a.kind === 'cash' || a.kind === 'card')).map((a) => a.first!).sort()
  const rename = (a: SetupAccount) => {
    if (process.env.EXPO_OS !== 'ios') return
    Alert.prompt('Rename Account', undefined, (v) => { if (v?.trim()) useChoices.setState((x) => ({ names: { ...x.names, [a.id]: v.trim() } })) }, 'plain-text', c.names[a.id] ?? a.suggested)
  }
  // A ref guard: a second tap while the first runs used to come back 409 and skip the last page. The success haptic
  // is the last page's checkmark.
  const finish = () => busy.run(async () => {
    try {
      const r = await api.setup.finish({ history: c.history, accounts: items.flatMap((it) => it.accounts).map((a) => ({ id: a.id, name: c.names[a.id] ?? a.suggested, include: !!a.kind && on(a) })) })
      queryClient.setQueriesData({ queryKey: ['setup'] }, false)
      await queryClient.invalidateQueries()
      router.replace({ pathname: '/welcome/done', params: { accounts: String(r.accounts.length), added: String(r.added), waiting: String(r.waiting) } })
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { // set up already, on another try: just go in
        queryClient.setQueriesData({ queryKey: ['setup'] }, false)
        await queryClient.invalidateQueries()
        leaveWelcome()
        return
      }
      failure()
      notify({ text: why(e, "Couldn't finish setup"), symbol: 'exclamationmark.triangle.fill', hue: 'orange' })
    }
  })
  if (!s.data && s.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top + 56, paddingHorizontal: space.xl }}>
        <Empty symbol="icloud.slash" title="Can’t Reach Tally" body={why(s.error, 'Check your connection and try again.')}>
          <Button label="Try Again" kind="tinted" onPress={() => s.refetch()} style={{ marginTop: space.l, alignSelf: 'stretch' }} />
        </Empty>
      </View>
    )
  }
  const none = !all.some(on)
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, space.l) }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.l, paddingTop: 40, gap: space.xxl, paddingBottom: space.xl }}>
        <View style={{ alignItems: 'center', gap: space.m, paddingHorizontal: space.l }}>
          <Txt v="largeTitle" center>Choose Accounts</Txt>
          <Txt v="body" tone="label2" center>Select the accounts you want Tally to track.</Txt>
        </View>
        {items.map((it) => (
          <Section key={it.id} title={it.brand || it.institution || 'Bank'} compact inset={64}>
            {it.accounts.filter((a) => a.kind).map((a) => {
              const look = KIND_LOOK[a.kind!]
              return (
                <Row key={a.id} leading={<Logo item={it.id} symbol={look.symbol} color={p[look.hue]} size={36} />}
                  title={c.names[a.id] ?? a.suggested}
                  subtitle={[look.one, a.mask ? `••${a.mask}` : '', a.current != null ? formatCents(a.current) : ''].filter(Boolean).join(' · ')}
                  onPress={() => rename(a)}
                  trailing={
                    <Press feel="scale" hitSlop={10} accessibilityLabel={on(a) ? 'Leave out' : 'Include'}
                      onPress={() => { tick(); useChoices.setState((x) => ({ off: { ...x.off, [a.id]: on(a) } })) }}>
                      <SF name={on(a) ? 'checkmark.circle.fill' : 'circle'} size={26} color={on(a) ? p.tint : p.label3} />
                    </Press>
                  } />
              )
            })}
          </Section>
        ))}
        <Section title="Start From" compact footer="Brings in up to two years of transactions.">
          <Row title="All History" subtitle={firsts.length ? `Since ${since(firsts[0])}` : undefined}
            onPress={() => { tick(); useChoices.setState({ history: 'all' }) }}
            trailing={c.history === 'all' ? <SF name="checkmark" size={17} color={p.tint} weight="semibold" /> : undefined} />
          <Row title="This Month"
            onPress={() => { tick(); useChoices.setState({ history: 'month' }) }}
            trailing={c.history === 'month' ? <SF name="checkmark" size={17} color={p.tint} weight="semibold" /> : undefined} />
        </Section>
      </ScrollView>
      <View style={{ paddingHorizontal: space.xl, gap: space.s }}>
        {busy.on ? <Txt v="footnote" tone="label2" center>Setting up. This can take a minute.</Txt>
          : none && s.data ? <Txt v="footnote" tone="label2" center>Choose at least one account.</Txt> : null}
        <Button label="Set Up Tally" onPress={finish} busy={busy.on} disabled={none} />
      </View>
    </View>
  )
}
