// The server's address and token.
import { useState } from 'react'
import { ScrollView, TextInput, View } from 'react-native'
import { useServer } from '@/lib/server'
import { success } from '@/design/haptics'
import { space, usePalette } from '@/design/theme'
import { Section } from '@/design/ui/List'

export default function Server() {
  const p = usePalette()
  const s = useServer()
  const [url, setUrl] = useState(s.url)
  const [token, setToken] = useState('')
  const field = { flex: 1, fontSize: 17, color: p.label, paddingVertical: space.m } as const
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }} contentContainerStyle={{ padding: space.l, gap: space.xxl }}
      keyboardShouldPersistTaps="handled">
      <Section title="Connection" compact footer="Your token is stored in the keychain.">
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
