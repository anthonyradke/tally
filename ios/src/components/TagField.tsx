// The draft's tags: typed, separated by spaces, or picked from the tags already in use. The ones used most sit as
// chips above the field (filtered to the tag being typed), so "work" doesn't drift into "Work" or "wrk".
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useDraft } from '@/lib/draft'
import { useTally } from '@/lib/tally'
import { addTag, parseTags, tagSuggestions } from '@/lib/txn'
import { space, useTheme } from '@/theme'
import { Chip } from './Chip'
import { Field } from './Field'
import { Icon } from './Icon'

export function TagField({ onFocus, onBlur }: { onFocus?: () => void; onBlur?: () => void }) {
  const { c } = useTheme()
  const t = useTally()
  const { d, set } = useDraft()
  const [text, setText] = useState<string | null>(null) // raw text while editing
  const shown = text ?? d.tags.join(' ')
  // Before the field is typed into, its last tag is finished, not one still being typed.
  const typed = text ?? (d.tags.length ? `${shown} ` : '')
  const offer = tagSuggestions(t.b?.tags ?? [], typed)
  const change = (v: string) => { setText(v); set({ tags: parseTags(v) }) }
  return (
    <View>
      {offer.length > 0 && (
        <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l, paddingTop: space.m }}>
          {offer.map((tag) => (
            <Chip key={tag} label={`#${tag}`} onDark onPress={() => {
              const tags = addTag(typed, tag)
              setText(`${tags.join(' ')} `)
              set({ tags })
            }} />
          ))}
        </ScrollView>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, minHeight: 50 }}>
        <Icon sf="number" md="tag" size={18} color={c.label2} />
        <Field value={shown} placeholder="Tags, separated by spaces" placeholderTextColor={c.label3}
          autoCapitalize="none" autoCorrect={false} onFocus={onFocus} onBlur={() => { onBlur?.(); setText(null) }}
          onChangeText={change} style={{ flex: 1, fontSize: 17, color: c.label, paddingVertical: space.m }} />
      </View>
    </View>
  )
}
