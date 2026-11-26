// The server's address and token. A new address or token is checked against the server before Tally switches to
// it, so a typo never clears what's on the phone or sends the outbox somewhere that doesn't answer.
import { useState, type ReactNode } from 'react'
import { ScrollView, TextInput, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { ApiError, probe } from '@/lib/api'
import { queryClient } from '@/lib/data'
import { cleanServer, defaultServer, useServer } from '@/lib/server'
import { useBusy } from '@/design/busy'
import { why } from '@/design/checkin'
import { success, warning } from '@/design/haptics'
import { space, usePalette } from '@/design/theme'
import { Row, Section } from '@/design/ui/List'
import { notify } from '@/design/ui/Notice'
import { Txt } from '@/design/ui/Txt'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, minHeight: 52 }}>
      <Txt v="body" style={{ width: 72 }}>{label}</Txt>
      {children}
    </View>
  )
}

export default function Server() {
  const p = usePalette()
  const s = useServer()
  const [url, setUrl] = useState(s.url)
  const [token, setToken] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const busy = useBusy()
  const live = useQuery({ queryKey: ['probe', s.url, s.token], queryFn: () => probe(s.url, s.token), retry: false, staleTime: 0, gcTime: 0 })
  const fallback = defaultServer()
  const field = { flex: 1, fontSize: 17, color: p.label, paddingVertical: space.m } as const

  /** Switch to an address once Tally answers there (a refused token still counts: the address is right). A cleared
   *  field means the default address. */
  const saveUrl = (typed: string) => busy.run(async () => {
    const next = cleanServer(typed) || fallback
    if (next === s.url) { setUrl(s.url); setProblem(null); return }
    try {
      await probe(next, s.token)
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) { warning(); setProblem(why(e, 'Tally did not answer at this address.')); return }
    }
    s.set(next); setUrl(next); setProblem(null)
    queryClient.clear() // another server's ledger
    success()
  })
  const saveToken = () => busy.run(async () => {
    const next = token.trim()
    if (!next || next === s.token) { setToken(''); return }
    try {
      await probe(s.url, next)
    } catch (e) {
      // Refused: keep the old one. Out of reach: keep the new one anyway; the line below says it isn't checked yet.
      if (e instanceof ApiError && e.status === 401) { warning(); setProblem('Tally refused this token.'); return }
    }
    s.setToken(next); setToken(''); setProblem(null)
    await queryClient.invalidateQueries()
    success()
  })
  const removeToken = () => {
    const old = s.token
    s.setToken('')
    warning()
    queryClient.invalidateQueries()
    notify({ text: 'Token Removed', symbol: 'key.fill', hue: 'gray', action: { label: 'Undo', run: () => { useServer.getState().setToken(old); return queryClient.invalidateQueries() } } })
  }

  const status = busy.on ? 'Checking…' : problem ?? (live.isPending ? 'Checking…' : live.data ? `Connected to Tally ${live.data}` : why(live.error, 'Tally did not answer at this address.'))
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }} contentContainerStyle={{ padding: space.l, gap: space.xxl }}
      keyboardShouldPersistTaps="handled">
      <Section title="Connection" compact inset={space.l} footer={status}>
        <Field label="Address">
          <TextInput value={url} onChangeText={setUrl} onEndEditing={() => saveUrl(url)} placeholder={fallback || 'https://…'} placeholderTextColor={p.label3}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="done" style={field} accessibilityLabel="Server address" />
        </Field>
        <Field label="Token">
          <TextInput value={token} onChangeText={setToken} onEndEditing={saveToken} placeholder={s.token ? 'Saved in Keychain' : 'None'} placeholderTextColor={p.label3}
            secureTextEntry autoCapitalize="none" autoCorrect={false} returnKeyType="done" style={field} accessibilityLabel="Token" />
        </Field>
      </Section>
      {(!!s.token || (!!fallback && s.url !== fallback)) && (
        <Section>
          {!!fallback && s.url !== fallback && <Row title="Use Default Address" tint onPress={() => { setUrl(fallback); saveUrl(fallback) }} disabled={busy.on} />}
          {!!s.token && <Row title="Remove Token" destructive onPress={removeToken} disabled={busy.on} />}
        </Section>
      )}
    </ScrollView>
  )
}
