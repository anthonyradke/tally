// What a screen shows when it has nothing true to show yet: a spinner while the first load runs, the way to fix a
// refused token, or that Tally can't be reached, with Try Again. Over data kept on the phone, a quiet line instead.
import type { ReactElement } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { router } from 'expo-router'
import { loadOf, updatedLabel, type LoadKind } from '../ledger'
import { space, usePalette } from '../theme'
import { Button } from './Button'
import { Empty } from './List'
import { Press } from './Press'
import { SF } from './SF'
import { Txt } from './Txt'

export interface Loadable { data?: unknown; error: unknown; dataUpdatedAt: number; refetch: () => unknown }

const openSettings = () => router.push('/settings')

export function Blocked({ kind, onRetry }: { kind: Exclude<LoadKind, 'ready'>; onRetry: () => unknown }) {
  if (kind === 'loading') return <ActivityIndicator style={{ marginTop: 96 }} />
  if (kind === 'locked') {
    return (
      <Empty symbol="lock.fill" title="Check the Token in Settings" body="Tally didn't accept it.">
        <Button label="Open Settings" kind="tinted" onPress={openSettings} style={{ marginTop: space.m }} />
      </Empty>
    )
  }
  return (
    <Empty symbol={kind === 'offline' ? 'wifi.slash' : 'exclamationmark.triangle'} title={kind === 'offline' ? "Can't Reach Tally" : "Couldn't Load Tally"}
      body={kind === 'offline' ? 'Check that Tailscale is on.' : undefined}>
      <Button label="Try Again" kind="tinted" onPress={() => { onRetry() }} style={{ marginTop: space.m }} />
    </Empty>
  )
}

/** The line over figures kept from an earlier load when the latest one failed. */
export function StaleNote({ kind, at }: { kind: 'locked' | 'offline'; at: number }) {
  const p = usePalette()
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 2 }}>
      <SF name={kind === 'locked' ? 'lock.fill' : 'wifi.slash'} size={12} color={p.label2} weight="semibold" />
      <Txt v="footnote" tone="label2" numberOfLines={1}>
        {kind === 'locked' ? 'Check the token in Settings' : ['Offline', updatedLabel(at)].filter(Boolean).join(' · ')}
      </Txt>
      {kind === 'locked' && <SF name="chevron.right" size={10} color={p.label3} weight="semibold" />}
    </View>
  )
  return kind === 'locked'
    ? <Press feel="none" haptic={false} onPress={openSettings} accessibilityRole="button" hitSlop={8}>{body}</Press>
    : body
}

/** A screen's gate: `block` stands in for the whole screen; `note` goes above figures shown from the phone. */
export function loadGate(q: Loadable): { block: ReactElement | null; note: ReactElement | null } {
  const s = loadOf(q)
  return {
    block: s.kind === 'ready' ? null : <Blocked kind={s.kind} onRetry={q.refetch} />,
    note: s.note ? <StaleNote kind={s.note} at={q.dataUpdatedAt} /> : null,
  }
}
