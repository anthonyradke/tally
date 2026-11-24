// Which Tally the app talks to: the real one or Tally Lab (bank sync on a separate ledger), and its token.
import { useState } from 'react'
import { ScrollView, TextInput, View } from 'react-native'
import { PROFILE_NAME, PROFILES, useServer, type Profile } from '@/lib/server'
import { switchProfile } from '@/lib/profile'
import { success, tick } from '@/next/haptics'
import { space, usePalette } from '@/next/theme'
import { Row, Section } from '@/next/ui/List'
import { Symbol } from '@/next/ui/Symbol'

export default function Server() {
  const p = usePalette()
  const s = useServer()
  const [url, setUrl] = useState(s.url)
  const [token, setToken] = useState('')
  const pick = async (x: Profile) => { if (x === s.profile) return; tick(); await switchProfile(x); setUrl(useServer.getState().url); setToken('') }
  const field = { flex: 1, fontSize: 17, color: p.label, paddingVertical: space.m } as const
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }} contentContainerStyle={{ padding: space.l, gap: space.xxl }}
      keyboardShouldPersistTaps="handled">
      <Section footer="Tally Lab is a separate ledger with bank sync, for trying things out. Nothing in one reaches the other.">
        {PROFILES.map((x) => (
          <Row key={x} title={PROFILE_NAME[x]} onPress={() => pick(x)}
            trailing={x === s.profile ? <Symbol name="checkmark" size={17} color={p.blue} weight="semibold" /> : undefined} />
        ))}
      </Section>
      <Section title="Connection" footer="The token is kept in the keychain. Leave it empty to keep the one saved.">
        <View style={{ paddingHorizontal: space.l }}>
          <TextInput value={url} onChangeText={setUrl} onEndEditing={() => { s.set(url); success() }} placeholder="https://…" placeholderTextColor={p.label3}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" style={field} />
        </View>
        <View style={{ paddingHorizontal: space.l }}>
          <TextInput value={token} onChangeText={setToken} onEndEditing={() => { if (token.trim()) { s.setToken(token); setToken(''); success() } }}
            placeholder={s.token ? 'Token saved' : 'Token'} placeholderTextColor={p.label3} secureTextEntry autoCapitalize="none" autoCorrect={false} style={field} />
        </View>
      </Section>
    </ScrollView>
  )
}
