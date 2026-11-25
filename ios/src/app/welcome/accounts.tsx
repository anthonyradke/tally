// Setup, step two: the accounts Tally will make from the banks, each with its bank's logo and balance. Untick any to
// leave out, tap a name to rename it, then choose how far back to start.
import { useState } from 'react'
import { Alert, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api, ApiError, type SetupAccount } from '@/lib/api'
import { queryClient } from '@/lib/data'
import { fromISO } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { failure, success, tick } from '@/design/haptics'
import { KIND_LOOK } from '@/design/look'
import { leaveWelcome, useChoices, useSetupStatus } from '@/design/setup'
import { space, usePalette } from '@/design/theme'
import { Button } from '@/design/ui/Button'
import { Row, Section } from '@/design/ui/List'
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
  const [busy, setBusy] = useState(false)
  const items = s.data?.items ?? []
  const all = items.flatMap((it) => it.accounts).filter((a) => a.kind)
  const on = (a: SetupAccount) => !c.off[a.id]
  const firsts = all.filter((a) => on(a) && a.first && (a.kind === 'cash' || a.kind === 'card')).map((a) => a.first!).sort()
  const rename = (a: SetupAccount) => {
    if (process.env.EXPO_OS !== 'ios') return
    Alert.prompt('Rename Account', undefined, (v) => { if (v?.trim()) useChoices.setState((x) => ({ names: { ...x.names, [a.id]: v.trim() } })) }, 'plain-text', c.names[a.id] ?? a.suggested)
  }
  const finish = async () => {
    setBusy(true)
    try {
      const r = await api.setup.finish({ history: c.history, accounts: items.flatMap((it) => it.accounts).map((a) => ({ id: a.id, name: c.names[a.id] ?? a.suggested, include: !!a.kind && on(a) })) })
      success()
      queryClient.setQueriesData({ queryKey: ['setup'] }, false)
      await queryClient.invalidateQueries()
      router.replace({ pathname: '/welcome/done', params: { accounts: String(r.accounts.length), added: String(r.added), waiting: String(r.waiting) } })
    } catch (e) {
      setBusy(false)
      if (e instanceof ApiError && e.status === 409) { // already set up (a second tap, or the flow came back): just go in
        queryClient.setQueriesData({ queryKey: ['setup'] }, false)
        await queryClient.invalidateQueries()
        leaveWelcome()
        return
      }
      failure()
      notify({ text: e instanceof ApiError ? e.errors.join(' ') : "Couldn't finish setup", symbol: 'exclamationmark.triangle.fill', hue: 'orange' })
    }
  }
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
                      <SF name={on(a) ? 'checkmark.circle.fill' : 'circle'} size={26} color={on(a) ? p.blue : p.label3} />
                    </Press>
                  } />
              )
            })}
          </Section>
        ))}
        <Section title="Start From" compact footer="Brings in up to two years of transactions.">
          <Row title="All History" subtitle={firsts.length ? `Since ${since(firsts[0])}` : undefined}
            onPress={() => { tick(); useChoices.setState({ history: 'all' }) }}
            trailing={c.history === 'all' ? <SF name="checkmark" size={17} color={p.blue} weight="semibold" /> : undefined} />
          <Row title="This Month"
            onPress={() => { tick(); useChoices.setState({ history: 'month' }) }}
            trailing={c.history === 'month' ? <SF name="checkmark" size={17} color={p.blue} weight="semibold" /> : undefined} />
        </Section>
      </ScrollView>
      <View style={{ paddingHorizontal: space.xl, gap: space.s }}>
        {busy && <Txt v="footnote" tone="label2" center>Setting up. This can take a minute.</Txt>}
        <Button label="Set Up Tally" onPress={finish} busy={busy} disabled={!all.some(on)} />
      </View>
    </View>
  )
}
